import { EVENTS, resolveLocalized, SOURCE_LANGUAGE } from '@supershop/shared';
import { createEmailProvider } from '../../adapters/email/index.js';
import { createSmsProvider } from '../../adapters/sms/index.js';
import { config } from '../../core/config.js';
import { NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { getSecretSetting, getSetting } from '../settings/index.js';
import { BUILT_IN_TEMPLATES, toSeed } from './notification.templates.js';
import * as repo from './notification.repo.js';

/**
 * Transactional messages (P4.5): one place that turns "this happened" into a message in the
 * customer's own language, sends it through an adapter and writes down what came of it.
 *
 * Three rules this file keeps:
 *  - the customer's language decides (`order.lang` / `customer.lang`), never the staff's;
 *  - nothing is ever sent without an enabled template AND an enabled channel;
 *  - a failure is recorded and retried by the queue, never swallowed and never fatal to the order.
 */

/** Seeds the built-in messages on first start. Safe to call repeatedly. */
export async function seedNotificationTemplates() {
  if (await repo.countTemplates()) return;
  for (const template of BUILT_IN_TEMPLATES) await repo.insertTemplate(toSeed(template));
}

// ------------------------------------------------------------------ providers

let cached = { key: null, email: null, sms: null };

const providerConfig = () => ({
  emailProvider: getSetting('notifications.emailProvider'),
  from: getSetting('notifications.emailFrom'),
  fromName: getSetting('notifications.emailFromName'),
  smtpHost: getSetting('notifications.smtpHost'),
  smtpPort: getSetting('notifications.smtpPort'),
  smtpSecure: getSetting('notifications.smtpSecure'),
  smtpUser: getSetting('notifications.smtpUser'),
  smsProvider: getSetting('notifications.smsProvider'),
  smsSender: getSetting('notifications.smsSender'),
});

/** Built from settings and rebuilt when they change; secrets are read but never cached in the key. */
export function providers({ fetchImpl } = {}) {
  const cfg = providerConfig();
  const key = JSON.stringify([cfg, Boolean(fetchImpl)]);
  if (cached.key !== key) {
    cached = {
      key,
      email: createEmailProvider({
        provider: cfg.emailProvider,
        from: cfg.from,
        fromName: cfg.fromName,
        smtp: {
          host: cfg.smtpHost,
          port: cfg.smtpPort,
          secure: cfg.smtpSecure,
          user: cfg.smtpUser,
          pass: getSecretSetting('notifications.smtpPassword') ?? '',
        },
      }),
      sms: createSmsProvider({
        provider: cfg.smsProvider,
        apiKey: getSecretSetting('notifications.smsApiKey') ?? '',
        sender: cfg.smsSender,
        fetchImpl,
      }),
    };
  }
  return cached;
}

export const resetProviderCache = () => {
  cached = { key: null, email: null, sms: null };
};

// ------------------------------------------------------------------ rendering

/** `{{a.b}}` → the value at that path. An unknown variable renders as an empty string. */
export function render(text, vars) {
  return String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
    return value == null ? '' : String(value);
  });
}

/**
 * The template for an event and channel, in one language, already filled in.
 * @returns {Promise<{ subject: string, body: string, key: string } | null>} null = nothing to send
 */
export async function renderTemplate(event, channel, lang, vars) {
  const template = await repo.findTemplate(`${event}.${channel}`);
  if (!template?.enabled) return null;
  return {
    key: template.key,
    subject: render(resolveLocalized(template.subject, lang), vars),
    body: render(resolveLocalized(template.body, lang), vars),
  };
}

// ------------------------------------------------------------------ sending

const channelEnabled = (channel) =>
  channel === 'email' ? getSetting('notifications.email') : getSetting('notifications.sms');

const log = (entry) =>
  repo
    .insertLog(entry)
    .catch((err) =>
      logger.error({ err: { message: err.message } }, 'notification log could not be written'),
    );

/**
 * Sends one message. Called by the queue worker, so a provider being slow or down never holds up
 * an order; the worker's retries do the waiting.
 * @param {{ event: string, channel: 'email'|'sms', to: string, lang?: string, vars?: object,
 *   orderId?: string | null, ref?: object | null, fetchImpl?: typeof fetch }} input
 * @returns {Promise<{ status: 'sent'|'skipped'|'failed' }>}
 */
export async function sendNotification({
  event,
  channel,
  to,
  lang = SOURCE_LANGUAGE,
  vars = {},
  orderId = null,
  ref = null,
  fetchImpl,
}) {
  if (!to) return { status: 'skipped', reason: 'no-recipient' };
  if (!channelEnabled(channel)) return { status: 'skipped', reason: 'channel-off' };

  const rendered = await renderTemplate(event, channel, lang, vars);
  if (!rendered) return { status: 'skipped', reason: 'no-template' };

  const provider = providers({ fetchImpl })[channel];
  const base = {
    channel,
    event,
    templateKey: rendered.key,
    to,
    lang,
    subject: rendered.subject || null,
    body: rendered.body,
    provider: provider?.name ?? null,
    orderId,
    ref,
  };

  if (!provider?.enabled) {
    await log({ ...base, status: 'skipped', error: 'provider not configured' });
    return { status: 'skipped', reason: 'provider-off' };
  }

  try {
    const result = await provider.send({ to, subject: rendered.subject, text: rendered.body });
    await log({ ...base, status: 'sent', providerRef: result?.id ?? null });
    void eventBus.emit(EVENTS.NOTIFICATION_SENT, { event, channel, to, lang, orderId });
    return { status: 'sent' };
  } catch (err) {
    await log({ ...base, status: 'failed', error: err.message });
    throw err; // the queue retries; the log already says what happened
  }
}

// ------------------------------------------------------------------ admin

export const toTemplateDto = (t) => ({
  id: String(t._id),
  key: t.key,
  event: t.event,
  channel: t.channel,
  subject: t.subject,
  body: t.body,
  enabled: t.enabled,
  builtIn: t.builtIn,
});

export const listTemplates = async () => (await repo.listTemplates()).map(toTemplateDto);

export async function updateTemplate(id, patch) {
  const updated = await repo.updateTemplate(id, (doc) => {
    // Only the English source is written; Arabic follows from the translation hooks (§5.7).
    if (patch.subject !== undefined) doc.set(`subject.${SOURCE_LANGUAGE}`, patch.subject);
    if (patch.body !== undefined) doc.set(`body.${SOURCE_LANGUAGE}`, patch.body);
    if (patch.enabled !== undefined) doc.enabled = patch.enabled;
  });
  if (!updated) throw new NotFoundError('Template not found');
  return toTemplateDto(updated);
}

/** What went out lately, for Settings → Notifications. */
export async function listLogs({ page = 1, limit = 20, channel, status } = {}) {
  const { items, total } = await repo.listLogs(
    { ...(channel && { channel }), ...(status && { status }) },
    { skip: (page - 1) * limit, limit },
  );
  return {
    data: items.map((l) => ({
      id: String(l._id),
      at: l.createdAt,
      channel: l.channel,
      event: l.event,
      to: l.to,
      lang: l.lang,
      subject: l.subject,
      body: l.body,
      status: l.status,
      provider: l.provider,
      error: l.error,
    })),
    meta: { page, limit, total },
  };
}

/** "Does my mail actually work?" — one real message to an address the admin types. */
export async function sendTestMessage({ channel, to, lang = SOURCE_LANGUAGE }, { fetchImpl } = {}) {
  const provider = providers({ fetchImpl })[channel];
  const vars = { store: { name: getSetting('store.name') }, customer: { name: 'Test' } };
  const text = render(
    'This is a test message from {{store.name}}. If you can read it, notifications work.',
    vars,
  );
  const subject = render('{{store.name}}: test message', vars);
  if (!provider?.enabled) {
    await log({
      channel,
      event: 'test',
      to,
      lang,
      subject,
      body: text,
      status: 'skipped',
      provider: provider?.name ?? null,
      error: 'provider not configured',
    });
    return { status: 'skipped' };
  }
  try {
    const result = await provider.send({ to, subject, text });
    await log({
      channel,
      event: 'test',
      to,
      lang,
      subject,
      body: text,
      status: 'sent',
      provider: provider.name,
      providerRef: result?.id ?? null,
    });
    return { status: 'sent' };
  } catch (err) {
    await log({
      channel,
      event: 'test',
      to,
      lang,
      subject,
      body: text,
      status: 'failed',
      provider: provider.name,
      error: err.message,
    });
    return { status: 'failed', error: err.message };
  }
}

/** The storefront link a customer follows to see their order. */
export const trackUrl = (orderNo, lang) =>
  `${config.STOREFRONT_URL.replace(/\/+$/, '')}${lang && lang !== SOURCE_LANGUAGE ? `/${lang}` : ''}` +
  `/track?order=${encodeURIComponent(orderNo)}`;
