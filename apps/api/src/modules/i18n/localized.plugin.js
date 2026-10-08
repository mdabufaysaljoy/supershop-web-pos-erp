import { resolveLocalized, SOURCE_LANGUAGE } from '@supershop/shared';
import mongoose from 'mongoose';
import { sha256 } from '../../core/crypto.js';
import { getTargetLanguages } from './languages.js';

/**
 * Localized fields for Mongoose models (CLAUDE.md §5.7).
 *
 *   const schema = new Schema({ name: LocalizedString, description: LocalizedString });
 *   schema.plugin(localized, { fields: ['name', 'description'] });
 *
 * Stored shape per field: { en, ar?, meta: { ar: { mode, srcHash, status, provider?, at?, error? } } }
 * - On save, if `en` changed (hash differs) and the language isn't locked as `manual`, the field is
 *   marked `pending` and a translation job is scheduled AFTER the save. The previous translation keeps
 *   being served until the job replaces it (no flash of English).
 * - Manual overrides (`setManualTranslation`) are never overwritten; `revertToAuto` re-enables jobs.
 * - The job writes with a guard (same `en`, not manual), so concurrent edits can't be clobbered.
 * Use `doc.save()` (or the helpers below) for localized models: `updateOne`/`findOneAndUpdate` skip
 * hooks — call `scheduleEntityTranslation` yourself after such updates.
 */

/** Sub-schema: English source + any language keys (strict:false — adding a language needs no code). */
export const LocalizedString = new mongoose.Schema(
  {
    [SOURCE_LANGUAGE]: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false, strict: false, minimize: false },
);

const FIELDS = Symbol.for('supershop.localizedFields');

/**
 * Localized fields of a model, or null when the model doesn't use the plugin (the job processor
 * refuses to touch anything else).
 * @param {string} modelName
 */
export function localizedFieldsOf(modelName) {
  return mongoose.models[modelName]?.schema?.[FIELDS] ?? null;
}

/** @type {(job: { model: string, id: string, items: { field: string, lang: string }[] }) => Promise<void>} */
let scheduler = async () => {};
/** Installed by i18n.jobs.js (BullMQ) or by tests. */
export function setTranslationScheduler(fn) {
  scheduler = fn;
}
export const scheduleEntityTranslation = (job) => scheduler(job);

export const sourceHash = (text) => sha256(text ?? '');

/**
 * Computes which (field, lang) pairs need translation for a document, updating meta in place.
 * Pure over the document's values (exported for tests and bulk "retranslate").
 */
export function markStale(doc, fields, langs = getTargetLanguages()) {
  const items = [];
  for (const field of fields) {
    const value = doc.get(field);
    if (!value) continue;
    const en = value[SOURCE_LANGUAGE] ?? '';
    const hash = sourceHash(en);
    const meta = { ...(value.meta ?? {}) };
    let changed = false;
    for (const lang of langs) {
      const m = meta[lang];
      if (m?.mode === 'manual') continue;
      if (!en.trim()) {
        if (value[lang] != null || m) {
          doc.set(`${field}.${lang}`, undefined);
          delete meta[lang];
          changed = true;
        }
        continue;
      }
      if (m?.srcHash === hash && m.status === 'done') continue;
      if (m?.status === 'pending' && m.pendingHash === hash) {
        items.push({ field, lang });
        continue;
      }
      meta[lang] = { ...m, mode: 'auto', status: 'pending', pendingHash: hash };
      changed = true;
      items.push({ field, lang });
    }
    if (changed) {
      doc.set(`${field}.meta`, meta);
      doc.markModified(`${field}.meta`);
    }
  }
  return items;
}

/**
 * @param {mongoose.Schema} schema
 * @param {{ fields: string[] }} opts
 */
export function localized(schema, { fields }) {
  if (!fields?.length) throw new Error('localized plugin: `fields` is required');

  schema.pre('save', function markLocalizedStale() {
    this.$locals.translationItems = markStale(this, fields);
  });

  schema.post('save', async function scheduleLocalized(doc) {
    const items = doc.$locals.translationItems;
    if (items?.length) {
      await scheduleEntityTranslation({
        model: doc.constructor.modelName,
        id: String(doc._id),
        items,
      });
    }
  });

  schema[FIELDS] = Object.freeze([...fields]);
}

/**
 * Locks a language to a human translation (never overwritten by auto jobs).
 * @param {mongoose.Document} doc
 */
export function setManualTranslation(doc, field, lang, text) {
  const value = doc.get(field) ?? {};
  doc.set(`${field}.${lang}`, text);
  doc.set(`${field}.meta`, {
    ...(value.meta ?? {}),
    [lang]: {
      mode: 'manual',
      srcHash: sourceHash(value[SOURCE_LANGUAGE]),
      status: 'done',
      at: new Date(),
    },
  });
  doc.markModified(`${field}.meta`);
}

/** Returns a language to automatic translation (re-translated on next save). */
export function revertToAuto(doc, field, lang) {
  const value = doc.get(field) ?? {};
  const meta = { ...(value.meta ?? {}) };
  meta[lang] = { mode: 'auto', status: 'stale' };
  doc.set(`${field}.meta`, meta);
  doc.markModified(`${field}.meta`);
}

/**
 * Plain object with localized fields resolved to strings for `lang` (public API responses).
 * Fallback chain: lang → English.
 * @param {object} plain  lean document
 * @param {string[]} fields
 * @param {string} lang
 */
export function resolveDoc(plain, fields, lang) {
  if (!plain) return plain;
  const out = { ...plain };
  for (const field of fields) {
    const parts = field.split('.');
    let target = out;
    for (const p of parts.slice(0, -1)) {
      target[p] = { ...target[p] };
      target = target[p];
    }
    const last = parts.at(-1);
    target[last] = resolveLocalized(target[last], lang);
  }
  return out;
}
