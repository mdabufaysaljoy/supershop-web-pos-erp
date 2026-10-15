/**
 * A flat list of translatable strings: `[{ key, value: LocalizedString }]`.
 *
 * Pages (P5.1) and menus (P5.4) both keep their customer-facing text this way, because the
 * translation engine works on array paths (`texts.*.value`) and then gives them staleness, manual
 * overrides, retranslate-all and the failed-job view for nothing (D-134).
 */

/**
 * Brings a stored text list in line with the English that is there now: new strings appear,
 * changed English is written to the source language (which marks its translation stale), and text
 * nobody points at any more goes away. Existing translations and manual overrides are untouched.
 * @param {{ key: string, text: string }[]} pairs  the English, in the order it is written
 * @param {{ key: string, value: object }[]} [existing]
 * @returns {{ key: string, value: object }[]} the array to store
 */
export function syncTextEntries(pairs, existing = []) {
  const byKey = new Map((existing ?? []).map((t) => [t.key, t]));
  return pairs.map(({ key, text }) => {
    const current = byKey.get(key);
    // Keep translations and meta; only the source changes here (staleness is the plugin's job).
    return current ? { key, value: { ...current.value, en: text } } : { key, value: { en: text } };
  });
}
