/** `dir/dir/name.ext` — lowercase letters, digits, `_`, `-`; dots only before the extension. */
const KEY_RE = /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[a-z0-9]{2,5}$/;

/** Storage keys are server-generated; this guard also blocks traversal (`..`, absolute paths). */
export const isSafeKey = (key) => typeof key === 'string' && key.length <= 300 && KEY_RE.test(key);
