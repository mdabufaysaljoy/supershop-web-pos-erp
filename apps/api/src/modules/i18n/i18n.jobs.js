import { EVENTS, SOURCE_LANGUAGE } from '@supershop/shared';
import mongoose from 'mongoose';
import { sha256 } from '../../core/crypto.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { enqueue, QUEUE_NAMES, registerWorker } from '../../core/queue.js';
import {
  localizedFieldsOf,
  matchesLocalizedPath,
  setTranslationScheduler,
  sourceHash,
} from './localized.plugin.js';
import { translate } from './translate.service.js';

/**
 * Translation jobs: translate the stale localized fields of one document.
 * Idempotent and race-safe: each write is conditional on the English source still being the text
 * that was translated and the language not being manually locked.
 */

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export class TranslationRetryableError extends Error {}

/**
 * @param {{ model: string, id: string, items: { field: string, lang: string }[], force?: boolean }} job
 *   force: re-translate even if already done for the current English ("retranslate all")
 * @returns {Promise<{ translated: number, failed: number, disabled: boolean, skipped: number }>}
 */
export async function processTranslationJob({ model, id, items, force = false }) {
  const fields = localizedFieldsOf(model);
  if (!fields) throw new Error(`Model "${model}" is not localized`);
  const Model = mongoose.model(model);
  const doc = await Model.findById(id).lean();
  // Not visible yet (job ran before the creating transaction committed) → let the queue retry.
  if (!doc) throw new TranslationRetryableError(`${model} ${id} not found`);

  // Re-evaluate against the CURRENT document (it may have changed since scheduling).
  const work = [];
  for (const { field, lang } of items) {
    if (!matchesLocalizedPath(fields, field)) continue;
    const value = get(doc, field);
    const en = value?.[SOURCE_LANGUAGE] ?? '';
    const meta = value?.meta?.[lang];
    if (!en.trim() || meta?.mode === 'manual') continue;
    if (!force && meta?.status === 'done' && meta.srcHash === sourceHash(en)) continue;
    work.push({ field, lang, en });
  }
  const stats = { translated: 0, failed: 0, disabled: false, skipped: items.length - work.length };
  if (!work.length) return stats;

  const byLang = Map.groupBy(work, (w) => w.lang);
  for (const [lang, list] of byLang) {
    const { results, provider, disabled } = await translate({
      texts: list.map((w) => w.en),
      to: lang,
    });
    if (disabled) {
      stats.disabled = true; // stays 'pending'; "Retranslate all" picks it up once enabled
      continue;
    }
    for (const [i, w] of list.entries()) {
      const text = results[i];
      const guard = {
        _id: id,
        [`${w.field}.${SOURCE_LANGUAGE}`]: w.en,
        [`${w.field}.meta.${lang}.mode`]: { $ne: 'manual' },
      };
      if (text == null) {
        stats.failed += 1;
        await Model.updateOne(guard, {
          $set: {
            [`${w.field}.meta.${lang}.status`]: 'failed',
            [`${w.field}.meta.${lang}.at`]: new Date(),
          },
        });
        continue;
      }
      await Model.updateOne(guard, {
        $set: {
          [`${w.field}.${lang}`]: text,
          [`${w.field}.meta.${lang}`]: {
            mode: 'auto',
            status: 'done',
            srcHash: sourceHash(w.en),
            provider,
            at: new Date(),
          },
        },
      });
      stats.translated += 1;
    }
  }

  const name = stats.failed ? EVENTS.TRANSLATION_FAILED : EVENTS.TRANSLATION_COMPLETED;
  void eventBus.emit(name, { model, id, ...stats });
  // Some failed → let BullMQ retry with backoff (provider may come back).
  if (stats.failed)
    throw new TranslationRetryableError(`${stats.failed} field(s) failed to translate`);
  return stats;
}

/** Wires the plugin's scheduler to BullMQ and starts the worker (called from server.js). */
export function startTranslationWorker({ concurrency = 2 } = {}) {
  setTranslationScheduler(async (job) => {
    // Deterministic id: re-saving the same content doesn't pile up duplicate jobs.
    const jobId = `tr-${sha256(JSON.stringify(job)).slice(0, 32)}`;
    try {
      await enqueue(QUEUE_NAMES.TRANSLATION, 'entity', job, { jobId, delay: 500 });
    } catch (err) {
      // Never fail the user's save because Redis is down; "Retranslate all" can recover later.
      logger.error(
        { err: { message: err.message }, model: job.model },
        'could not enqueue translation job',
      );
    }
  });
  return registerWorker(QUEUE_NAMES.TRANSLATION, (job) => processTranslationJob(job.data), {
    concurrency,
  });
}
