import { createHmac } from 'node:crypto';
import { config } from '../../core/config.js';
import { safeEqual } from '../../core/crypto.js';

/**
 * Creates a tamper-proof signed unsubscribe token for a customer & channel (P7.3).
 * Format: `<customerId>.<channel>.<signature>`
 * @param {{ customerId: string, channel?: string }} input
 * @returns {string}
 */
export function createUnsubscribeToken({ customerId, channel = 'all' }) {
  const secret = config.MASTER_KEY || 'default-secret-key';
  const data = `${String(customerId)}:${channel}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${String(customerId)}.${channel}.${sig}`;
}

/**
 * Verifies an unsubscribe token and returns the parsed customerId and channel, or null if invalid.
 * @param {string} token
 * @returns {{ customerId: string, channel: string } | null}
 */
export function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [customerId, channel, sig] = parts;
  const secret = config.MASTER_KEY || 'default-secret-key';
  const data = `${customerId}:${channel}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');

  if (!safeEqual(sig, expectedSig)) return null;
  return { customerId, channel };
}
