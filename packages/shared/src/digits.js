/**
 * Digit normalization (CLAUDE.md §5.3): users on an Arabic keyboard type Arabic-Indic digits
 * (٠١٢٣٤٥٦٧٨٩) or Extended Arabic-Indic / Persian digits (۰۱۲۳۴۵۶۷۸۹). Every numeric input is
 * normalized to ASCII 0-9 BEFORE validation and storage.
 */

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/**
 * Converts Arabic-Indic digits to ASCII and the Arabic decimal separator (٫) to '.'.
 * The Arabic thousands separator (٬) is removed. Other characters are kept unchanged.
 * @param {string} value
 * @returns {string}
 */
export function normalizeDigits(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
}
