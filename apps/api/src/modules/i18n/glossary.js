import { getCounterValue, incrementCounter } from '../../core/counter.js';
import * as repo from './i18n.repo.js';

/**
 * Glossary access with a short in-memory cache. Any glossary change must call
 * `bumpGlossaryVersion()`: the version is part of every cache key, so affected texts are
 * re-translated instead of served from the old cache.
 */
const VERSION_KEY = 'i18n:glossaryVersion';
const TTL_MS = 30_000;
let cached = null;
let versionEpoch = 0;

export async function getGlossary() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const currentEpoch = versionEpoch;
  const [version, terms] = await Promise.all([
    getCounterValue(VERSION_KEY),
    repo.listGlossaryTerms(),
  ]);
  const entry = { at: Date.now(), version, terms };
  if (versionEpoch === currentEpoch) {
    cached = entry;
  }
  return entry;
}

export async function bumpGlossaryVersion() {
  cached = null;
  versionEpoch++;
  return incrementCounter(VERSION_KEY, 1);
}

/**
 * Adds `term` as "never translate" unless the glossary already has an entry for it (an admin's
 * existing choice — e.g. a preferred translation — is never overridden).
 * @returns {Promise<string | null>} id of the new term, or null when it already existed
 */
export async function protectTerm(term) {
  const res = await repo.insertGlossaryTermIfMissing({ term, doNotTranslate: true });
  if (!res.upsertedCount) return null;
  await bumpGlossaryVersion();
  return String(res.upsertedId);
}

export const clearGlossaryCache = () => {
  cached = null;
  versionEpoch++;
};

/**
 * Protected terms for a target language (input to `mask`).
 * @param {{ terms: any[] }} glossary
 * @param {string} to
 */
export function protectedTermsFor(glossary, to) {
  return glossary.terms
    .map((t) => {
      if (t.doNotTranslate) return { term: t.term };
      const target = t.targets instanceof Map ? t.targets.get(to) : t.targets?.[to];
      return target ? { term: t.term, replacement: target } : null;
    })
    .filter(Boolean);
}

/** Brand/payment names that must never be translated. English only — no hand-written Arabic. */
export const DEFAULT_DO_NOT_TRANSLATE = Object.freeze([
  'Supershop',
  'Mada',
  'STC Pay',
  'Apple Pay',
  'Google Pay',
  'Tabby',
  'Tamara',
  'Visa',
  'Mastercard',
  'iPhone',
  'Samsung',
  'WhatsApp',
]);

export async function seedGlossary() {
  for (const term of DEFAULT_DO_NOT_TRANSLATE)
    await repo.insertGlossaryTermIfMissing({ term, doNotTranslate: true });
  await bumpGlossaryVersion();
}
