import { MINOR_PER_MAJOR, assertMinor } from './money.js';

/**
 * Locale-aware display formatting (CLAUDE.md §5.6/§5.7). Display only — never parse output back.
 *
 * Pitfalls handled explicitly (Intl defaults differ between browsers / ICU versions):
 * - `ar-SA` may default to the Hijri (islamic-umalqura) calendar → calendar is always explicit.
 * - `ar-SA` defaults to Arabic-Indic digits → numbering system follows the admin digit-style setting.
 * - Dates are shown in the store time zone (Asia/Riyadh), not the server's or browser's.
 *
 * @typedef {object} FormatOptions
 * @property {string} lang                       'en' | 'ar' | …
 * @property {'latn' | 'arab'} [digits]          admin setting `i18n.digitStyle` (applies to Arabic UI)
 * @property {string} [timeZone]                 settings `store.timeZone`
 * @property {'gregorian' | 'hijri' | 'both'} [calendar]  settings `store.calendarDisplay`
 * @property {string} [currency]                 settings `store.currency`
 * @property {string} [region]                   country for the locale, default 'SA'
 */

const CALENDAR = { gregorian: 'gregory', hijri: 'islamic-umalqura' };

/** @param {FormatOptions} opts */
export function createFormatters({
  lang,
  digits = 'latn',
  timeZone = 'Asia/Riyadh',
  calendar = 'gregorian',
  currency = 'SAR',
  region = 'SA',
}) {
  const locale = `${lang}-${region}`;
  // Latin script UIs always use Western digits; the setting only switches Arabic UI digits.
  const numberingSystem = lang === 'ar' ? digits : 'latn';
  const num = (o = {}) => new Intl.NumberFormat(locale, { numberingSystem, ...o });
  const date = (cal, o) =>
    new Intl.DateTimeFormat(locale, { numberingSystem, timeZone, calendar: cal, ...o });

  const formatDateWith = (value, o) => {
    const d = value instanceof Date ? value : new Date(value);
    if (calendar === 'both')
      return `${date('gregory', o).format(d)} (${date(CALENDAR.hijri, o).format(d)})`;
    return date(CALENDAR[calendar] ?? 'gregory', o).format(d);
  };

  return Object.freeze({
    locale,
    numberingSystem,
    /** @param {number} n */
    number: (n, o) => num(o).format(n),
    /** Integer without grouping (years, order numbers). @param {number} n */
    plain: (n) => num({ useGrouping: false }).format(n),
    /** @param {number} ratio 0.15 → 15% */
    percent: (ratio, o) => num({ style: 'percent', maximumFractionDigits: 2, ...o }).format(ratio),
    /** Money from integer minor units (halalas). @param {number} minor */
    money: (minor) => {
      assertMinor(minor);
      return num({
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minor / MINOR_PER_MAJOR);
    },
    /** @param {Date | string | number} value */
    date: (value, o = { dateStyle: 'long' }) => formatDateWith(value, o),
    /** @param {Date | string | number} value */
    dateTime: (value, o = { dateStyle: 'medium', timeStyle: 'short' }) => formatDateWith(value, o),
  });
}
