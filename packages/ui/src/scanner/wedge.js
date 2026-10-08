/**
 * Tells scanner bursts from human typing: a scan is ≥ `minLength` characters, each arriving within
 * `maxGapMs` of the previous one, terminated by Enter. Pure (time is passed in) → unit-testable.
 * @param {{ minLength?: number, maxGapMs?: number }} [opts]
 */
export function createWedgeDetector({ minLength = 4, maxGapMs = 50 } = {}) {
  let buffer = '';
  let last = -Infinity;
  return {
    /** Feed a code character; returns true while it looks like part of a scan. */
    char(ch, time) {
      buffer = time - last <= maxGapMs ? buffer + ch : ch;
      last = time;
      return buffer.length > 1;
    },
    /** Enter pressed: returns the scanned code, or null if this wasn't a scan. */
    enter(time) {
      const code = buffer.length >= minLength && time - last <= maxGapMs ? buffer : null;
      buffer = '';
      last = -Infinity;
      return code;
    },
    reset() {
      buffer = '';
      last = -Infinity;
    },
  };
}
