/** "Translation off": nothing is sent anywhere; localized fields fall back to English. */
export const noopProvider = Object.freeze({
  name: 'noop',
  enabled: false,
  async translateBatch() {
    throw new Error('Translation provider is disabled (noop)');
  },
  async health() {
    return true;
  },
});
