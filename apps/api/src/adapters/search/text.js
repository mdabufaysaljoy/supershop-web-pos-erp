import { normalizeDigits } from '@supershop/shared';

/**
 * Search text normalization (index AND query go through the same functions, so they always agree).
 *
 * Arabic: diacritics (harakat) and tatweel removed; hamza/madda alef forms → bare alef; alef
 * maqsura → yaa; taa marbuta → haa; waw/yaa with hamza → waw/yaa; Arabic-Indic digits → ASCII;
 * words starting with the article alef-lam (optionally preceded by waw/baa/faa/kaf) are also
 * indexed without it. English/Latin: lower-cased, accents removed, simple plural stemming
 * (shoes → shoe, berries → berry, boxes → box). Arabic code points are written as \u escapes.
 */

const TATWEEL = /\u0640/g;
const AR_LETTERS = [
  [/[\u0622\u0623\u0625\u0671]/g, '\u0627'], // alef variants → bare alef
  [/\u0649/g, '\u064A'], // alef maqsura → yaa
  [/\u0629/g, '\u0647'], // taa marbuta → haa
  [/\u0624/g, '\u0648'], // waw with hamza → waw
  [/\u0626/g, '\u064A'], // yaa with hamza → yaa
];
/** Optional conjunction/preposition (waw, baa, faa, kaf) + the article alef-lam, ≥ 2 letters left. */
const AR_ARTICLE = /^(?:[\u0648\u0628\u0641\u0643])?\u0627\u0644(?=.{2,})/;
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

/** Lower-case, accent-free, Arabic-normalized text. */
export function normalizeText(text) {
  // NFKD splits accents and hamza/madda off their letters; then every combining mark
  // (Latin accents and Arabic harakat alike) is dropped.
  let s = normalizeDigits(String(text ?? ''))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(TATWEEL, '');
  for (const [re, to] of AR_LETTERS) s = s.replace(re, to);
  return s;
}

/** English plural → singular (deliberately small and predictable). */
export function stem(word) {
  if (!/^[a-z]+$/.test(word) || word.length < 4) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Arabic word without the definite article (or null when it has none). */
const withoutArticle = (word) => (AR_ARTICLE.test(word) ? word.replace(AR_ARTICLE, '') : null);

/**
 * Index tokens for a text: every normalized word, its English stem and its Arabic form without the
 * article.
 * @param {string} text
 * @returns {string[]} unique tokens
 */
export function indexTokens(text) {
  const out = new Set();
  for (const word of normalizeText(text).match(TOKEN_RE) ?? []) {
    out.add(word);
    out.add(stem(word));
    const bare = withoutArticle(word);
    if (bare) out.add(bare);
  }
  return [...out];
}

/**
 * Query terms: normalized words reduced the same way (stem / no article), so a term is a PREFIX
 * of some index token when it matches ("shirts" -> "shirt"; an Arabic word loses its article).
 * @returns {string[]} unique terms in input order (max 10)
 */
export function queryTerms(text) {
  const terms = [];
  for (const word of normalizeText(text).match(TOKEN_RE) ?? []) {
    const term = withoutArticle(word) ?? stem(word);
    if (!terms.includes(term)) terms.push(term);
  }
  return terms.slice(0, 10);
}
