import { EVENTS, PERMISSIONS, SOURCE_LANGUAGE } from '@supershop/shared';
import mongoose from 'mongoose';
import { ConflictError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { inspectQueue, QUEUE_NAMES, retryAllFailedJobs, retryFailedJob } from '../../core/queue.js';
import { getSetting } from '../settings/index.js';
import { bumpGlossaryVersion, clearGlossaryCache } from './glossary.js';
import * as repo from './i18n.repo.js';
import { getTargetLanguages } from './languages.js';
import {
  expandPaths,
  localizedFieldsOf,
  queryPathOf,
  scheduleEntityTranslation,
  sourceHash,
} from './localized.plugin.js';
import { getMonthlyUsage, isTranslationEnabled, translate } from './translate.service.js';

/**
 * Admin "Settings → Languages" use cases (CLAUDE.md §5.7 / P0.13). Every mutation takes the acting
 * staff's AccessContext and emits an audited event. Reading needs settings.view; writing needs
 * settings.languages (enforced by routes; asserted here as well).
 */
/** Resolves `fallback` if `promise` doesn't settle in time (a down Redis must not hang the page). */
const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    promise.catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), ms).unref?.()),
  ]);

const emit = (name, payload, actor) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
const assertWrite = (actor) => actor.assert(PERMISSIONS.SETTINGS_LANGUAGES);

// ---------------------------------------------------------------- overview

/** Models that use the localized() plugin (content that gets machine-translated). */
const localizedModels = () =>
  Object.keys(mongoose.models)
    .map((name) => ({ name, fields: localizedFieldsOf(name) }))
    .filter((m) => m.fields);

/** Per-model counts of content translations by status (pending / failed / manual …). */
async function contentStatus() {
  const langs = getTargetLanguages();
  const out = [];
  for (const { name, fields } of localizedModels()) {
    const Model = mongoose.model(name);
    const row = { model: name, pending: 0, failed: 0, manual: 0 };
    for (const field of fields) {
      for (const lang of langs) {
        const path = `${queryPathOf(field)}.meta.${lang}`;
        const [pending, failed, manual] = await Promise.all([
          Model.countDocuments({ [`${path}.status`]: { $in: ['pending', 'stale'] } }),
          Model.countDocuments({ [`${path}.status`]: 'failed' }),
          Model.countDocuments({ [`${path}.mode`]: 'manual' }),
        ]);
        row.pending += pending;
        row.failed += failed;
        row.manual += manual;
      }
    }
    out.push(row);
  }
  return out;
}

export async function getOverview() {
  const [usage, languages, content, queue] = await Promise.all([
    getMonthlyUsage(),
    repo.listLanguages(),
    contentStatus(),
    withTimeout(inspectQueue(QUEUE_NAMES.TRANSLATION, { failedLimit: 20 }), 1_500, null), // null → "unavailable" in UI
  ]);
  return {
    provider: getSetting('i18n.provider'),
    enabled: isTranslationEnabled(),
    usage: {
      month: new Date().toISOString().slice(0, 7),
      chars: usage,
      budget: getSetting('i18n.monthlyCharBudget'),
    },
    languages: languages.map((l) => ({
      code: l.code,
      name: l.name,
      nativeName: l.nativeName,
      rtl: l.rtl,
      enabled: l.enabled,
      isSource: l.isSource,
    })),
    content,
    queue,
  };
}

/** Round-trip through the real pipeline with a sample sentence (does not change anything). */
export async function testProvider(actor) {
  assertWrite(actor);
  const sample = 'Add to cart';
  const started = Date.now();
  const { results, provider, disabled } = await translate({
    texts: [sample],
    to: getTargetLanguages()[0] ?? 'ar',
  });
  return {
    provider,
    enabled: !disabled,
    ok: results[0] != null,
    sample,
    result: results[0],
    ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------- glossary

const toTermDto = (t) => ({
  id: String(t._id),
  term: t.term,
  doNotTranslate: Boolean(t.doNotTranslate),
  targets: Object.fromEntries(
    t.targets instanceof Map ? t.targets : Object.entries(t.targets ?? {}),
  ),
  updatedAt: t.updatedAt,
});

export async function listGlossary() {
  return (await repo.listGlossaryTerms())
    .map(toTermDto)
    .sort((a, b) => a.term.localeCompare(b.term));
}

async function glossaryChanged(actor, change) {
  await bumpGlossaryVersion(); // new cache keys → affected texts are re-translated on next run
  clearGlossaryCache();
  emit(EVENTS.GLOSSARY_UPDATED, change, actor);
}

export async function createGlossaryTerm(actor, input) {
  assertWrite(actor);
  if (await repo.findGlossaryByTermKey(input.term.toLowerCase())) {
    throw new ConflictError('Term already exists', { fields: ['term'] });
  }
  const created = toTermDto(
    await repo.createGlossaryTerm({ ...input, targets: input.doNotTranslate ? {} : input.targets }),
  );
  await glossaryChanged(actor, { termId: created.id, after: created });
  return created;
}

export async function updateGlossaryTerm(actor, id, patch) {
  assertWrite(actor);
  const before = await repo.findGlossaryTerm(id);
  if (!before) throw new NotFoundError('Term not found');
  if (patch.term) {
    const clash = await repo.findGlossaryByTermKey(patch.term.toLowerCase());
    if (clash && String(clash._id) !== String(id))
      throw new ConflictError('Term already exists', { fields: ['term'] });
  }
  const next = patch.doNotTranslate ? { ...patch, targets: {} } : patch;
  const after = toTermDto(await repo.updateGlossaryTerm(id, next));
  await glossaryChanged(actor, { termId: String(id), before: toTermDto(before), after });
  return after;
}

export async function deleteGlossaryTerm(actor, id) {
  assertWrite(actor);
  const before = await repo.deleteGlossaryTerm(id);
  if (!before) throw new NotFoundError('Term not found');
  await glossaryChanged(actor, { termId: String(id), before: toTermDto(before) });
}

// ---------------------------------------------------------------- UI string overrides

/** Public: `{ key: value }` overlay for a catalog/language (served to the storefront, cached). */
export async function getUiOverrideMap(catalog, lang) {
  const rows = await repo.listUiOverrides(catalog, lang);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Admin: overrides with their English fingerprint (the screen compares it to the current English). */
export async function listUiOverrides(catalog, lang) {
  return (await repo.listUiOverrides(catalog, lang)).map((r) => ({
    key: r.key,
    value: r.value,
    srcHash: r.srcHash,
    updatedAt: r.updatedAt,
  }));
}

export async function setUiOverride(actor, { catalog, lang, key }, { value, source }) {
  assertWrite(actor);
  const before = await repo.findUiOverride(catalog, lang, key);
  const row = await repo.upsertUiOverride({
    catalog,
    lang,
    key,
    value,
    srcHash: sourceHash(source),
    updatedBy: actor.staffId,
  });
  emit(
    EVENTS.UI_STRING_OVERRIDE_SET,
    { catalog, lang, key, before: before?.value ?? null, after: value },
    actor,
  );
  return { key: row.key, value: row.value, srcHash: row.srcHash, updatedAt: row.updatedAt };
}

export async function removeUiOverride(actor, { catalog, lang, key }) {
  assertWrite(actor);
  const removed = await repo.deleteUiOverride(catalog, lang, key);
  if (!removed) throw new NotFoundError('Override not found');
  emit(EVENTS.UI_STRING_OVERRIDE_REMOVED, { catalog, lang, key, before: removed.value }, actor);
}

// ---------------------------------------------------------------- retranslate & queue

/**
 * Schedules translation jobs for localized content.
 * - pending_failed: items never translated, stale, or failed (e.g. after enabling the provider);
 * - all: every auto translation again (e.g. after switching to a better provider). Manual
 *   overrides are never touched.
 * @returns {Promise<{ scheduled: number }>} number of documents scheduled
 */
export async function retranslate(actor, { scope }) {
  assertWrite(actor);
  const langs = getTargetLanguages();
  let scheduled = 0;
  for (const { name, fields } of localizedModels()) {
    const Model = mongoose.model(name);
    const or = [];
    for (const pattern of fields) {
      const field = queryPathOf(pattern);
      for (const lang of langs) {
        const meta = `${field}.meta.${lang}`;
        if (scope === 'all')
          or.push({
            [`${meta}.mode`]: { $ne: 'manual' },
            [`${field}.${SOURCE_LANGUAGE}`]: { $nin: ['', null] },
          });
        else
          or.push(
            { [`${meta}.status`]: { $in: ['pending', 'failed', 'stale'] } },
            { [meta]: { $exists: false }, [`${field}.${SOURCE_LANGUAGE}`]: { $nin: ['', null] } },
          );
      }
    }
    if (!or.length) continue;
    // Load the localized roots so `*` patterns expand to this document's concrete paths.
    const projection = Object.fromEntries(fields.map((f) => [f.split('.')[0], 1]));
    const cursor = Model.find({ $or: or }, projection).lean().cursor();
    for await (const doc of cursor) {
      const items = expandPaths(doc, fields).flatMap((field) =>
        langs.map((lang) => ({ field, lang })),
      );
      await scheduleEntityTranslation({
        model: name,
        id: String(doc._id),
        items,
        force: scope === 'all',
      });
      scheduled += 1;
    }
  }
  emit(EVENTS.TRANSLATION_RETRANSLATE_REQUESTED, { scope, scheduled }, actor);
  return { scheduled };
}

export async function retryJob(actor, jobId) {
  assertWrite(actor);
  if (!(await retryFailedJob(QUEUE_NAMES.TRANSLATION, jobId)))
    throw new NotFoundError('Failed job not found');
}

export async function retryAllFailed(actor) {
  assertWrite(actor);
  await retryAllFailedJobs(QUEUE_NAMES.TRANSLATION);
}
