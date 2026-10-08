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

export async function getGlossary() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const [version, terms] = await Promise.all([
    getCounterValue(VERSION_KEY),
    repo.listGlossaryTerms(),
  ]);
  cached = { at: Date.now(), version, terms };
  return cached;
}

export async function bumpGlossaryVersion() {
  cached = null;
  return incrementCounter(VERSION_KEY, 1);
}

export const clearGlossaryCache = () => {
  cached = null;
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
