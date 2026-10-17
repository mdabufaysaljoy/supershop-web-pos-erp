/**
 * Campaigns constants and pure helpers (P7.3).
 */
export const CAMPAIGN = Object.freeze({
  CHANNELS: Object.freeze(['email', 'sms']),
  STATUSES: Object.freeze(['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed']),
  DELIVERY_STATUSES: Object.freeze(['pending', 'sent', 'failed', 'skipped']),
  MAX_NAME_LENGTH: 100,
  MAX_SUBJECT_LENGTH: 150,
  MAX_MESSAGE_LENGTH: 2000,
  VARIABLES: Object.freeze([
    'customer.name',
    'customer.email',
    'customer.phone',
    'store.name',
    'unsubscribe_url',
  ]),
});

/**
 * Pure template interpolation for marketing campaigns.
 * Replaces `{{variable}}` with the matching variable or empty string if absent.
 * @param {string} text
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
export function interpolateCampaignTemplate(text, vars = {}) {
  if (!text) return '';
  return String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path) => {
    const val = path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), vars);
    return val == null ? '' : String(val);
  });
}
