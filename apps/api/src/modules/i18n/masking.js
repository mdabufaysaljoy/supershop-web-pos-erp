/**
 * Protects parts of a text from machine translation (CLAUDE.md §5.7 "Never translate"):
 * HTML tags & entities, {placeholders} / {{vars}} / printf %s, URLs, emails, numbers, SKU-like
 * codes, glossary do-not-translate terms, and glossary preferred pairs (restored as the admin's
 * chosen translation). Each protected span becomes a token `[n]`; after translation every token
 * must come back EXACTLY once or the result is rejected (the English text is kept instead).
 *
 * Token format chosen EMPIRICALLY against real LibreTranslate (Argos en→ar): `⟦n⟧` and `XQnQX` were
 * destroyed, `{n}` survived 3/6 test sentences, `[n]` survived 6/6 (PROGRESS D-046).
 */
const OPEN = '[';
const CLOSE = ']';

export class MaskMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MaskMismatchError';
  }
}

// Order matters: earlier alternatives win when spans overlap.
const PROTECTED_PATTERNS = [
  /\[\d+\]/, // literal "[3]" in the source would collide with our tokens → protect it
  /<[^<>]+>/, // HTML tag
  /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i, // HTML entity
  /\{\{\s*[\w.]+\s*\}\}|\{[\w.]+\}|%(?:\d+\$)?[sdif]/, // placeholders
  /\bhttps?:\/\/[^\s<>"']+/i, // URL
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, // email
  /\b(?=[A-Z0-9_.-]*\d)(?=[A-Z0-9_.-]*[A-Z])[A-Z0-9][A-Z0-9_.-]{2,}\b/, // SKU-like code (letters+digits)
  /\d+(?:[.,:/]\d+)*%?/, // numbers, prices, times, dates, percentages
  /[\u00A9\u00AE\u2122\u2120]/, // © ® ™ ℠ (observed being dropped by the engine)
];

/** Bump when masking rules change: it is part of the translation cache key. */
export const MASKING_VERSION = 2;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @typedef {{ term: string, replacement?: string }} ProtectedTerm
 *   replacement undefined → keep the term as-is (do-not-translate); string → use it (preferred pair)
 */

/**
 * @param {string} text
 * @param {{ terms?: ProtectedTerm[] }} [opts]
 * @returns {{ masked: string, restore: string[], leading: string, trailing: string, translatable: boolean }}
 */
export function mask(text, { terms = [] } = {}) {
  const leading = text.match(/^\s*/)[0];
  const trailing = text.slice(leading.length).match(/\s*$/)[0];
  const core = text.slice(leading.length, text.length - trailing.length);

  // Longest terms first so "Apple Pay" wins over "Apple".
  const sorted = [...terms]
    .filter((t) => t.term?.trim())
    .sort((a, b) => b.term.length - a.term.length);
  const termRes = sorted.map((t) => `(?<![\\p{L}\\p{N}])${escapeRe(t.term)}(?![\\p{L}\\p{N}])`);
  const sources = [...termRes, ...PROTECTED_PATTERNS.map((r) => r.source)];
  const combined = new RegExp(sources.map((s) => `(${s})`).join('|'), 'giu');

  const restore = [];
  const masked = core.replace(combined, (match, ...groups) => {
    const idx = groups.findIndex((g, i) => i < sources.length && g !== undefined);
    const term = idx < sorted.length ? sorted[idx] : null;
    restore.push(term?.replacement ?? match);
    return `${OPEN}${restore.length - 1}${CLOSE}`;
  });

  const translatable = /[\p{L}]/u.test(masked.replace(/\[\d+\]/g, ''));
  return { masked, restore, leading, trailing, translatable };
}

const TOKEN_RE = /\[\s*(\d+)\s*\]/g;
const brackets = (str) => (str.match(/[[\]]/g) ?? []).length;

/**
 * Restores tokens in a translated string. Throws MaskMismatchError when any token is missing,
 * duplicated or unknown, or when brackets were added/lost (the provider mangled the masking).
 * @param {string} translated
 * @param {{ restore: string[], leading: string, trailing: string }} m
 */
export function unmask(translated, m) {
  // Any bracket added or lost means a token was mangled ("[3" or "3]") → reject.
  if (brackets(translated) !== m.restore.length * 2)
    throw new MaskMismatchError('token brackets changed');
  const seen = new Array(m.restore.length).fill(0);
  const out = translated.trim().replace(TOKEN_RE, (_, n) => {
    const i = Number(n);
    if (i >= m.restore.length) throw new MaskMismatchError(`unknown token ${i}`);
    seen[i] += 1;
    return m.restore[i];
  });
  const bad = seen.findIndex((c) => c !== 1);
  if (bad !== -1) throw new MaskMismatchError(`token ${bad} appears ${seen[bad]} times`);
  return `${m.leading}${out}${m.trailing}`;
}

/** Languages whose script is not Latin: output still mostly Latin = engine returned English. */
const NON_LATIN_SCRIPT = { ar: /\p{Script=Arabic}/gu };

/** Share of letters in Latin script, ignoring tokens (protected spans may legitimately be Latin). */
function latinShare(maskedText) {
  const text = maskedText.replace(/\[\d+\]/g, '');
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (!letters) return 0;
  return (text.match(/\p{Script=Latin}/gu) ?? []).length / letters;
}

/**
 * Sanity checks on a machine translation (treat provider output as untrusted).
 * @param {string} source original text
 * @param {string} result unmasked translation
 * @param {{ to?: string, maskedOutput?: string }} [ctx]  target language + raw (still masked) output
 * @returns {string | null} reason it was rejected, or null when acceptable
 */
export function rejectReason(source, result, { to, maskedOutput } = {}) {
  if (!result.trim()) return 'empty';
  // Real engines sometimes return the English (or half of it) untranslated.
  if (to && NON_LATIN_SCRIPT[to] && maskedOutput && latinShare(maskedOutput) > 0.25)
    return 'untranslated';
  const count = (s, ch) => s.split(ch).length - 1;
  // Every tag came from the source via tokens; any extra angle bracket was injected.
  if (count(result, '<') !== count(source, '<') || count(result, '>') !== count(source, '>'))
    return 'markup_changed';
  const ratio = result.length / Math.max(1, source.length);
  if (source.length >= 20 && (ratio < 0.25 || ratio > 4)) return 'length_ratio';
  return null;
}
