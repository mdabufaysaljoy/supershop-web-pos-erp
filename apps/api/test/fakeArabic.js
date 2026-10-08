/**
 * Deterministic fake "translation" for tests: maps each Latin letter to an Arabic-script code point
 * (U+0627 + offset). Produces Arabic-script output (passes the "untranslated" check) without any
 * hand-written Arabic. Digits, brackets ([n] tokens) and punctuation are untouched.
 */
export const fakeAr = (text) =>
  text.replace(/[a-z]/gi, (ch) =>
    String.fromCharCode(0x0627 + (ch.toLowerCase().charCodeAt(0) - 97)),
  );
