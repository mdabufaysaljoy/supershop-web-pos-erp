import { normalizeDigits } from '@supershop/shared';

/**
 * Barcode scanners are "keyboard wedges": they type the code and press Enter. When the OS keyboard
 * layout is Arabic, a scanner sending the key for "A" produces "ش", so we read the PHYSICAL key
 * (`event.code`) for letters, digits, '-', '_' and '.', falling back to `event.key`.
 * @param {KeyboardEvent | { code?: string, key?: string, shiftKey?: boolean }} e
 * @returns {string | null} upper-case code character, or null for anything else
 */
export function charFromKeyEvent(e) {
  const code = e.code ?? '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^(Digit|Numpad)\d$/.test(code)) return code.at(-1);
  if (code === 'Minus') return e.shiftKey ? '_' : '-';
  if (code === 'NumpadSubtract') return '-';
  if (code === 'Period' || code === 'NumpadDecimal') return '.';
  const key =
    typeof e.key === 'string' && e.key.length === 1 ? normalizeDigits(e.key).toUpperCase() : '';
  return /^[A-Z0-9_.-]$/.test(key) ? key : null;
}

export const isEnter = (e) => e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
