import { ERROR_CODES } from '@supershop/shared';
import { AppError } from '../../core/errors.js';

/**
 * Unifonic (KSA) — REST, one message per call:
 *   POST https://el.cloud.unifonic.com/rest/SMS/messages
 *   form fields: AppSid, Recipient (international, no "+"), Body, SenderID
 * Written from the published API shape; verify with a real AppSid before go-live.
 */
const URL = 'https://el.cloud.unifonic.com/rest/SMS/messages';
const TIMEOUT_MS = 10_000;

const failed = (detail) =>
  new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, `SMS could not be sent (${detail})`, {
    status: 502,
  });

export function createUnifonicProvider({ appSid, sender, fetchImpl }) {
  return {
    name: 'unifonic',
    enabled: Boolean(appSid),
    async send({ to, text }) {
      const body = new URLSearchParams({
        AppSid: appSid,
        Recipient: String(to).replace(/^\+/, ''),
        Body: text,
        ...(sender && { SenderID: sender }),
      });
      let res;
      try {
        res = await (fetchImpl ?? globalThis.fetch)(URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw failed('network');
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === 'false' || json?.success === false)
        throw failed(json?.message ?? `status ${res.status}`);
      return { id: json?.data?.MessageID ? String(json.data.MessageID) : null };
    },
  };
}
