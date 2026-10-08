import { normalizeDigits } from '../digits.js';

/**
 * Pure keystroke/paste sanitizers (CLAUDE.md §5.3). Input components call these on
 * `beforeinput`/paste to drop characters that can never be valid; zod schemas still validate the
 * final value (server AND client). They never "fix" a value into something different the user
 * didn't type — they only remove disallowed characters.
 */

/** Letters (Latin/Arabic incl. diacritics), spaces, apostrophe, hyphen, dot. No digits. */
export const sanitizeName = (v) =>
  String(v ?? '')
    .replace(/[^\p{Script=Latin}\p{Script=Arabic}\p{M}' .-]/gu, '')
    .replace(/[\p{N}]/gu, '');

/** Digits plus a single leading '+'. Arabic-Indic digits converted. */
export const sanitizePhone = (v) => {
  const s = normalizeDigits(String(v ?? '')).replace(/[^\d+]/g, '');
  return s.startsWith('+') ? `+${s.slice(1).replace(/\+/g, '')}` : s.replace(/\+/g, '');
};

/** Digits and at most one '.', max 2 decimals. */
export const sanitizeMoney = (v) => {
  const s = normalizeDigits(String(v ?? '')).replace(/[^\d.]/g, '');
  const [whole, ...rest] = s.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

/** Digits only. */
export const sanitizeInteger = (v) => normalizeDigits(String(v ?? '')).replace(/\D/g, '');

/** SKU/barcode: upper-cased, allowed charset only. */
export const sanitizeCode = (v) =>
  normalizeDigits(String(v ?? ''))
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '');

/** Email: no whitespace, lower-cased. */
export const sanitizeEmail = (v) =>
  String(v ?? '')
    .replace(/\s/g, '')
    .toLowerCase();

/** Slug: lower-case a-z, 0-9, single hyphens. */
export const sanitizeSlug = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');

/** Free text: strip control characters (keeps newlines/tabs) and angle brackets. */
export const sanitizePlainText = (v) =>
  String(v ?? '').replace(/[<>]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // eslint-disable-line no-control-regex
