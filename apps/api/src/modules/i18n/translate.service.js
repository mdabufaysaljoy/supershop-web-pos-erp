import { EVENTS, SOURCE_LANGUAGE } from '@supershop/shared';
import { z } from 'zod';
import { createTranslationProvider } from '../../adapters/translation/index.js';
import { createCircuitBreaker } from '../../core/circuitBreaker.js';
import { config } from '../../core/config.js';
import { getCounterValue, incrementCounter } from '../../core/counter.js';
import { sha256 } from '../../core/crypto.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { getRedis } from '../../core/redis.js';
import { getSecretSetting, getSetting, registerSettingDefinitions } from '../settings/index.js';
import { getGlossary, protectedTermsFor } from './glossary.js';
import * as repo from './i18n.repo.js';
import { mask, MaskMismatchError, rejectReason, unmask } from './masking.js';

/**
 * translate({ texts, to }) — the ONE entry point for machine translation (CLAUDE.md §5.7):
 *   dedupe → glossary-aware masking → cache (Redis hot → Mongo) → budget check →
 *   provider in batches (circuit breaker) → unmask + validate → store → results in input order.
 *
 * Returns `null` for any text that could not be translated (provider off/down, budget hit,
 * rejected output); callers keep serving English and retry later. Never throws for provider
 * problems. Only content (catalog, CMS, UI keys) may be passed — never customer PII.
 */

export const API_KEY_SETTING = 'i18n.libretranslateApiKey';
// Server-only secret (never in @supershop/shared): optional, for instances started with LT_API_KEYS.
registerSettingDefinitions([
  {
    key: API_KEY_SETTING,
    group: 'languages',
    schema: z.string().min(1).max(500),
    default: null,
    secret: true,
  },
]);
const HOT_TTL_SEC = 7 * 24 * 3600;
const BATCH_MAX_TEXTS = 25;
const BATCH_MAX_CHARS = 5_000;

const breaker = createCircuitBreaker({
  name: 'translation',
  failureThreshold: 5,
  cooldownMs: 30_000,
});

/** @type {null | { name: string, enabled: boolean, translateBatch: Function }} */
let providerOverride = null;
/** Tests / tooling inject a provider here (null = use settings). */
export function setTranslationProviderOverride(p) {
  providerOverride = p;
  breaker.reset();
}

function currentProvider() {
  if (providerOverride) return providerOverride;
  return createTranslationProvider({
    provider: getSetting('i18n.provider'),
    libretranslateUrl: getSetting('i18n.libretranslateUrl'),
    apiKey: getSecretSetting(API_KEY_SETTING),
  });
}

export const isTranslationEnabled = () => currentProvider().enabled;

// ---------- hot cache (Redis); disabled in tests ----------
const hot = {
  async mget(keys) {
    if (config.isTest || !keys.length) return keys.map(() => null);
    try {
      return await getRedis().mget(keys.map((k) => `supershop:tr:${k}`));
    } catch {
      return keys.map(() => null);
    }
  },
  async mset(entries) {
    if (config.isTest || !entries.length) return;
    try {
      const pipe = getRedis().pipeline();
      for (const [k, v] of entries) pipe.set(`supershop:tr:${k}`, v, 'EX', HOT_TTL_SEC);
      await pipe.exec();
    } catch {
      // hot cache is best-effort
    }
  },
};

const monthKey = () => `i18n:chars:${new Date().toISOString().slice(0, 7)}`;
export const getMonthlyUsage = () => getCounterValue(monthKey());

function chunk(items) {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const item of items) {
    if (
      current.length &&
      (current.length >= BATCH_MAX_TEXTS || chars + item.m.masked.length > BATCH_MAX_CHARS)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.m.masked.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * @param {{ texts: string[], to: string, from?: string }} input
 * @returns {Promise<{ results: (string | null)[], provider: string, disabled: boolean }>}
 */
export async function translate({ texts, to, from = SOURCE_LANGUAGE }) {
  const provider = currentProvider();
  const results = texts.map((t) => (typeof t === 'string' && t.trim() === '' ? t : null));
  if (to === from) return { results: texts.slice(), provider: provider.name, disabled: false };

  const glossary = await getGlossary();
  const terms = protectedTermsFor(glossary, to);

  // Dedupe identical strings (site-wide repetition is common: "Add to cart", sizes, colors…).
  const unique = new Map(); // text → { key, masked info, indexes[] }
  texts.forEach((text, i) => {
    if (typeof text !== 'string' || text.trim() === '') return;
    let entry = unique.get(text);
    if (!entry) {
      entry = {
        text,
        key: sha256(`${from}|${to}|${glossary.version}|${text}`),
        m: mask(text, { terms }),
        indexes: [],
      };
      unique.set(text, entry);
    }
    entry.indexes.push(i);
  });
  const entries = [...unique.values()];
  const settle = (entry, value) => entry.indexes.forEach((i) => (results[i] = value));

  // Nothing to translate (only numbers/codes/glossary terms) → restore directly, no provider call.
  for (const e of entries) if (!e.m.translatable) settle(e, unmask(e.m.masked, e.m));
  let pending = entries.filter((e) => e.m.translatable);

  // Cache: Redis hot cache, then Mongo.
  const hotValues = await hot.mget(pending.map((e) => e.key));
  pending = pending.filter((e, i) =>
    hotValues[i] != null ? (settle(e, hotValues[i]), false) : true,
  );
  if (pending.length) {
    const rows = await repo.findCachedTranslations(pending.map((e) => e.key));
    const byKey = new Map(rows.map((r) => [r.key, r.text]));
    await hot.mset(rows.map((r) => [r.key, r.text]));
    pending = pending.filter((e) =>
      byKey.has(e.key) ? (settle(e, byKey.get(e.key)), false) : true,
    );
  }

  if (!pending.length) return { results, provider: provider.name, disabled: false };
  if (!provider.enabled) return { results, provider: provider.name, disabled: true };

  // Budget guard (0 = unlimited).
  const budget = getSetting('i18n.monthlyCharBudget');
  const needed = pending.reduce((n, e) => n + e.m.masked.length, 0);
  if (budget > 0 && (await getMonthlyUsage()) + needed > budget) {
    logger.warn({ needed, budget }, 'translation budget exceeded; keeping source text');
    void eventBus.emit(EVENTS.TRANSLATION_BUDGET_EXCEEDED, {
      needed,
      budget,
      month: monthKey().slice(-7),
    });
    return { results, provider: provider.name, disabled: false };
  }

  const stored = [];
  for (const batch of chunk(pending)) {
    let outputs;
    try {
      outputs = await breaker.exec(() =>
        provider.translateBatch(
          batch.map((e) => e.m.masked),
          { from, to },
        ),
      );
      await incrementCounter(
        monthKey(),
        batch.reduce((n, e) => n + e.m.masked.length, 0),
      );
    } catch (err) {
      logger.warn(
        { err: { message: err.message }, provider: provider.name, count: batch.length },
        'translation batch failed',
      );
      continue; // leave these as null; jobs retry later
    }
    batch.forEach((e, i) => {
      const out = outputs?.[i];
      if (typeof out !== 'string') return;
      let value;
      try {
        value = unmask(out, e.m);
      } catch (err) {
        if (!(err instanceof MaskMismatchError)) throw err;
        logger.warn(
          { reason: err.message, provider: provider.name },
          'translation rejected: placeholder mismatch',
        );
        return;
      }
      const reason = rejectReason(e.text, value);
      if (reason) {
        logger.warn({ reason, provider: provider.name }, 'translation rejected');
        return;
      }
      settle(e, value);
      stored.push({
        key: e.key,
        from,
        to,
        source: e.text,
        text: value,
        provider: provider.name,
        glossaryVersion: glossary.version,
      });
    });
  }

  await repo.insertCachedTranslations(stored);
  await hot.mset(stored.map((r) => [r.key, r.text]));
  return { results, provider: provider.name, disabled: false };
}

/** Test helper: reset breaker state. */
export const _resetBreaker = () => breaker.reset();
export const _breakerState = () => breaker.state();
