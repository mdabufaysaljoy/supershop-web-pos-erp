import nodemailer from 'nodemailer';
import { AppError } from '../../core/errors.js';
import { ERROR_CODES } from '@supershop/shared';

/**
 * SMTP — works with any mail service a shop already has (its own server, SES, Postmark, Gmail…),
 * which is why it is the first real provider: no account to open, no vendor in the data.
 * The transport is built once per configuration and reused (SMTP connections are pooled).
 */
let cached = { key: null, transport: null };

const unavailable = (message) =>
  new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, `Email could not be sent (${message})`, {
    status: 502,
  });

/**
 * @param {{ host: string, port: number, secure?: boolean, user?: string, pass?: string,
 *   from: string, fromName?: string, transportFactory?: Function }} cfg
 */
export function createSmtpProvider({
  host,
  port = 587,
  secure = false,
  user,
  pass,
  from,
  fromName,
  transportFactory = nodemailer.createTransport,
}) {
  const enabled = Boolean(host && from);
  const key = JSON.stringify({ host, port, secure, user, pass: Boolean(pass) });

  const transport = () => {
    if (cached.key !== key) {
      cached = {
        key,
        transport: transportFactory({
          host,
          port,
          secure,
          pool: true,
          ...(user ? { auth: { user, pass } } : {}),
        }),
      };
    }
    return cached.transport;
  };

  return {
    name: 'smtp',
    enabled,
    async send({ to, subject, text, html, replyTo }) {
      if (!enabled) throw unavailable('not configured');
      try {
        const info = await transport().sendMail({
          from: fromName ? `${fromName} <${from}>` : from,
          to,
          subject,
          text,
          ...(html && { html }),
          ...(replyTo && { replyTo }),
        });
        return { id: info?.messageId ?? null };
      } catch (err) {
        throw unavailable(err.message);
      }
    },
  };
}

/** Tests build a provider without touching the module-level cache. */
export const resetSmtpCache = () => {
  cached = { key: null, transport: null };
};
