import { ERROR_CODES } from '@supershop/shared';
import { AppError } from '../../core/errors.js';

/**
 * Taqnyat (KSA) — REST with a bearer token:
 *   POST https://api.taqnyat.sa/v1/messages
 *   JSON: { recipients: ["9665…"], body, sender }
 * Written from the published API shape; verify with a real token before go-live.
 */
const URL = 'https://api.taqnyat.sa/v1/messages';
const TIMEOUT_MS = 10_000;

const failed = (detail) =>
  new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, `SMS could not be sent (${detail})`, {
    status: 502,
  });

export function createTaqnyatProvider({ bearerToken, sender, fetchImpl }) {
  return {
    name: 'taqnyat',
    enabled: Boolean(bearerToken && sender),
    async send({ to, text }) {
      let res;
      try {
        res = await (fetchImpl ?? globalThis.fetch)(URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipients: [String(to).replace(/^\+/, '')],
            body: text,
            sender,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw failed('network');
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || (json?.statusCode && json.statusCode >= 300))
        throw failed(json?.message ?? `status ${res.status}`);
      return { id: json?.messageId ? String(json.messageId) : null };
    },
  };
}
