/**
 * Keystroke filtering for text inputs (CLAUDE.md §5.3). Two layers:
 *
 * 1. `blockInvalidInsertion` (beforeinput): cancels an insertion with NOTHING valid in it (e.g. a
 *    letter typed into a quantity) so it never appears. Partly-valid multi-character insertions
 *    (mobile word predictions, autocomplete, IME commits: "  X@Y.Z  ") are let through and cleaned
 *    by layer 2 — blocking them would silently discard the user's text. Characters the sanitizer
 *    only TRANSFORMS ('A' → 'a', '٥' → '5') are never blocked.
 * 2. `applySanitizer` (change): runs the sanitizer on the whole value — covers paste, autofill,
 *    drag-drop, IME and mobile keyboards that don't report beforeinput data — and restores the
 *    caret so removing a character mid-text doesn't throw the cursor to the end.
 *
 * Sanitizers are pure functions from @supershop/shared (`validators.sanitize*`); they must be
 * prefix-consistent (sanitize(a + b) starts with sanitize(a)) for the caret math to hold.
 */

/**
 * @param {{ data?: string | null, preventDefault: () => void }} event  native or React beforeinput
 * @param {(v: string) => string} sanitize
 * @returns {boolean} true when the insertion was blocked
 */
export function blockInvalidInsertion(event, sanitize) {
  const data = event.data;
  if (!data) return false;
  if (sanitize(data) === '') {
    event.preventDefault();
    return true;
  }
  return false;
}

/**
 * Rewrites `input.value` with the sanitized value and restores the caret.
 * @param {HTMLInputElement | HTMLTextAreaElement} input
 * @param {(v: string) => string} sanitize
 * @returns {boolean} true when the value changed
 */
export function applySanitizer(input, sanitize) {
  const raw = input.value;
  const clean = sanitize(raw);
  if (clean === raw) return false;

  let caret = null;
  try {
    caret = input.selectionStart; // null / throws for type=email|number in some browsers
  } catch {
    caret = null;
  }
  input.value = clean;
  if (caret != null) {
    const next = Math.min(sanitize(raw.slice(0, caret)).length, clean.length);
    try {
      input.setSelectionRange(next, next);
    } catch {
      // selection API unsupported for this input type — value is still correct
    }
  }
  return true;
}
