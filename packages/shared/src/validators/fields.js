import { z } from 'zod';
import { isValidGtin, looksLikeGtin } from '../barcode.js';
import { normalizeDigits } from '../digits.js';
import { toMinor } from '../money.js';
import { V } from './messages.js';

/**
 * Field validators shared by API (validate middleware), forms (zod resolver) and input
 * components (CLAUDE.md §5.3). Each export is a schema or a factory returning one; factories take
 * the admin-configurable limits (settings) so nothing business-related is hardcoded here.
 * All messages are i18n keys from `V`.
 */

// Missing value → REQUIRED; wrong type → INVALID_TYPE.
const typeError = (iss) => (iss.input === undefined ? V.REQUIRED : V.INVALID_TYPE);
const str = () => z.string({ error: typeError });
const collapseSpaces = (s) => s.replace(/\s+/g, ' ').trim();

// ---------- name ----------
const NAME_RE = /^[\p{Script=Latin}\p{Script=Arabic}\p{M}' .-]+$/u;
const HAS_DIGIT_RE = /\p{N}/u;
const LETTER_COUNT_RE = /[\p{Script=Latin}\p{Script=Arabic}]/gu;

/** Person name: Latin/Arabic letters, spaces, ' - . ; 2–60 chars; trimmed, spaces collapsed. */
export const name = str()
  .transform(collapseSpaces)
  .pipe(
    str()
      .min(2, { error: V.TOO_SHORT })
      .max(60, { error: V.TOO_LONG })
      .refine((v) => NAME_RE.test(v) && !HAS_DIGIT_RE.test(v), { error: V.NAME_INVALID })
      .refine((v) => (v.match(LETTER_COUNT_RE) ?? []).length >= 2, { error: V.NAME_INVALID }),
  );

// ---------- email ----------
/** Email: trimmed, lower-cased, RFC-reasonable, max 254. */
export const email = str()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: V.EMAIL_INVALID }).max(254, { error: V.TOO_LONG }));

// ---------- phone ----------
const KSA_MOBILE_RE = /^(?:\+?966|00966|0)?(5\d{8})$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Normalizes a phone number. KSA mobiles → `+9665XXXXXXXX`.
 * Accepts 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665…, 009665…, Arabic-Indic digits,
 * and visual separators (spaces, dashes, parentheses, dots). Letters → invalid.
 * @param {string} raw
 * @param {{ allowInternational?: boolean }} [opts]
 * @returns {string | null} normalized number or null when invalid
 */
export function normalizePhone(raw, { allowInternational = false } = {}) {
  if (typeof raw !== 'string') return null;
  const s = normalizeDigits(raw).trim();
  if (!/^[\d+\s().-]+$/.test(s)) return null;
  const compact = s.replace(/[\s().-]/g, '');
  const ksa = KSA_MOBILE_RE.exec(compact);
  if (ksa) return `+966${ksa[1]}`;
  if (allowInternational) {
    const intl = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
    if (E164_RE.test(intl) && !intl.startsWith('+966')) return intl;
  }
  return null;
}

/**
 * Phone schema → normalized E.164 string.
 * @param {{ allowInternational?: boolean }} [opts] from settings (default KSA mobiles only)
 */
export const phone = ({ allowInternational = false } = {}) =>
  str().transform((v, ctx) => {
    const n = normalizePhone(v, { allowInternational });
    if (!n) {
      ctx.addIssue({
        code: 'custom',
        message: allowInternational ? V.PHONE_INVALID : V.PHONE_KSA_ONLY,
      });
      return z.NEVER;
    }
    return n;
  });

// ---------- money ----------
/**
 * API money: integer minor units (halalas).
 * @param {{ allowZero?: boolean, max?: number }} [opts]
 */
export const moneyMinor = ({ allowZero = true, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z
    .number({ error: V.MONEY_INVALID })
    .int({ error: V.MONEY_INVALID })
    .min(allowZero ? 0 : 1, { error: allowZero ? V.MONEY_NEGATIVE : V.MONEY_ZERO })
    .max(max, { error: V.MONEY_TOO_LARGE });

/**
 * UI money: decimal string/number in major units (max 2 decimals, Arabic digits OK) → minor units.
 * @param {{ allowZero?: boolean, max?: number }} [opts] `max` in minor units
 */
export const moneyInput = ({ allowZero = true, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z
    .union([str(), z.number()], { error: V.MONEY_INVALID })
    .transform((v, ctx) => {
      const s = typeof v === 'string' ? normalizeDigits(v).trim() : v;
      if (typeof s === 'string' && /^\d+\.\d{3,}$/.test(s)) {
        ctx.addIssue({ code: 'custom', message: V.MONEY_TOO_MANY_DECIMALS });
        return z.NEVER;
      }
      try {
        return toMinor(s);
      } catch {
        ctx.addIssue({ code: 'custom', message: V.MONEY_INVALID });
        return z.NEVER;
      }
    })
    .pipe(moneyMinor({ allowZero, max }));

// ---------- quantity ----------
/**
 * Positive integer quantity. Accepts numbers or digit strings (Arabic digits OK).
 * @param {{ max?: number }} [opts] max from settings
 */
export const quantity = ({ max = 9999 } = {}) =>
  z
    .preprocess(
      (v) =>
        typeof v === 'string' && /^\s*[\d٠-٩۰-۹]+\s*$/.test(v)
          ? Number(normalizeDigits(v.trim()))
          : v,
      z
        .number({ error: V.QTY_INVALID })
        .int({ error: V.QTY_INVALID })
        .min(1, { error: V.QTY_INVALID }),
    )
    .pipe(z.number().max(max, { error: V.QTY_TOO_LARGE }));

// ---------- address / plain text ----------
// Control chars except \t \n \r, and angle brackets (no HTML).
const UNSAFE_TEXT_RE = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/; // eslint-disable-line no-control-regex

/**
 * Plain free text without HTML; trimmed.
 * @param {{ min?: number, max?: number }} [opts]
 */
export const plainText = ({ min = 0, max = 500 } = {}) =>
  str()
    .trim()
    .min(min, { error: min <= 1 ? V.REQUIRED : V.TOO_SHORT })
    .max(max, { error: V.TOO_LONG })
    .refine((v) => !UNSAFE_TEXT_RE.test(v), { error: V.ADDRESS_INVALID });

/** Address line: 3–250 chars, no HTML, spaces collapsed. */
export const address = str()
  .transform(collapseSpaces)
  .pipe(plainText({ min: 3, max: 250 }));

// ---------- password ----------
/**
 * Password policy (values come from settings; defaults are the conservative baseline).
 * Max length bounds hashing cost (argon2 DoS guard).
 * @param {{ minLength?: number, maxLength?: number, requireLower?: boolean, requireUpper?: boolean,
 *   requireDigit?: boolean, requireSymbol?: boolean }} [policy]
 */
export const password = ({
  minLength = 10,
  maxLength = 128,
  requireLower = true,
  requireUpper = false,
  requireDigit = true,
  requireSymbol = false,
} = {}) =>
  str()
    .min(minLength, { error: V.PASSWORD_TOO_SHORT })
    .max(maxLength, { error: V.PASSWORD_TOO_LONG })
    .superRefine((v, ctx) => {
      const need = (cond, message) => !cond && ctx.addIssue({ code: 'custom', message });
      if (requireLower) need(/\p{Ll}/u.test(v), V.PASSWORD_NEEDS_LOWER);
      if (requireUpper) need(/\p{Lu}/u.test(v), V.PASSWORD_NEEDS_UPPER);
      if (requireDigit) need(/\d/.test(normalizeDigits(v)), V.PASSWORD_NEEDS_DIGIT);
      if (requireSymbol) need(/[^\p{L}\p{N}]/u.test(v), V.PASSWORD_NEEDS_SYMBOL);
    });

// ---------- codes / slugs / ids ----------
const CODE_RE = /^[A-Z0-9_.-]+$/;

/** Product/variant SKU: upper-cased, [A-Z0-9-_.], 1–64. Uniqueness is enforced by the DB. */
export const sku = str()
  .trim()
  .transform((v) => normalizeDigits(v).toUpperCase())
  .pipe(
    str()
      .min(1, { error: V.REQUIRED })
      .max(64, { error: V.TOO_LONG })
      .regex(CODE_RE, { error: V.CODE_INVALID }),
  );

/**
 * Barcode: same charset, 4–64. Digit-only codes of GTIN length (8/12/13/14) must carry a valid
 * GS1 check digit — a wrong one is almost always a typo or a misread.
 */
export const barcode = str()
  .trim()
  .transform((v) => normalizeDigits(v).toUpperCase())
  .pipe(
    str()
      .min(4, { error: V.TOO_SHORT })
      .max(64, { error: V.TOO_LONG })
      .regex(CODE_RE, { error: V.CODE_INVALID })
      .refine((v) => !looksLikeGtin(v) || isValidGtin(v), { error: V.BARCODE_CHECKSUM }),
  );

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL slug: lower-case [a-z0-9] words joined by single hyphens, max 120. */
export const slug = str()
  .trim()
  .toLowerCase()
  .pipe(
    str()
      .min(1, { error: V.REQUIRED })
      .max(120, { error: V.TOO_LONG })
      .regex(SLUG_RE, { error: V.SLUG_INVALID }),
  );

/**
 * Suggests a slug from English text ("Men's T-Shirts & Polos" → "mens-t-shirts-polos").
 * Returns '' when nothing usable remains (e.g. Arabic-only input) — caller must then ask for one.
 * @param {string} text
 */
export function toSlug(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

/** MongoDB ObjectId as a 24-char hex string. */
export const objectId = str().regex(/^[a-f\d]{24}$/i, { error: V.ID_INVALID });

/** Absolute http(s) URL. */
export const httpUrl = z
  .url({ protocol: /^https?$/, error: V.URL_INVALID })
  .max(2048, { error: V.TOO_LONG });

// ---------- list queries ----------
const intParam = (def, min, max) =>
  z.preprocess(
    (v) =>
      v === undefined || v === ''
        ? undefined
        : typeof v === 'string'
          ? Number(normalizeDigits(v))
          : v,
    z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(min, { error: V.INVALID_TYPE })
      .max(max, { error: V.TOO_LONG })
      .default(def),
  );

/**
 * `?page&limit&sort` for list endpoints. `sort` is whitelisted per endpoint:
 * `paginationQuery({ sortable: ['createdAt', 'price'], defaultSort: '-createdAt' })`.
 * Produces `{ page, limit, sort: { field, direction: 1 | -1 } }`.
 * @param {{ sortable?: string[], defaultSort?: string, maxLimit?: number, defaultLimit?: number }} [opts]
 */
export const paginationQuery = ({
  sortable = ['createdAt'],
  defaultSort = '-createdAt',
  maxLimit = 100,
  defaultLimit = 20,
} = {}) =>
  z.object({
    page: intParam(1, 1, 100_000),
    limit: intParam(defaultLimit, 1, maxLimit),
    sort: str()
      .default(defaultSort)
      .transform((v, ctx) => {
        const direction = v.startsWith('-') ? -1 : 1;
        const field = v.replace(/^[-+]/, '');
        if (!sortable.includes(field)) {
          ctx.addIssue({ code: 'custom', message: V.SORT_INVALID });
          return z.NEVER;
        }
        return { field, direction };
      }),
  });
