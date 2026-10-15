import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { email, objectId, phone, plainText } from '../validators/fields.js';

/**
 * Notification templates (P4.5). English is authored, Arabic generated (§5.7); `{{variables}}` are
 * protected by the translation pipeline, so a translated message keeps every one of them.
 */
export const NOTIFICATION = Object.freeze({
  CHANNELS: Object.freeze(['email', 'sms']),
  SUBJECT_MAX: 150,
  /** One SMS is 70 characters in Arabic; longer messages are split and billed per part. */
  BODY_MAX: 2000,
  LOG_STATUSES: Object.freeze(['sent', 'failed', 'skipped']),
});

export function createNotificationSchemas({ allowInternationalPhone = false } = {}) {
  return {
    idParam: z.object({ id: objectId }),
    /** Only the wording and the switch: which event a template belongs to is fixed. */
    updateTemplate: z
      .object({
        subject: plainText({ max: NOTIFICATION.SUBJECT_MAX }).optional(),
        body: plainText({ min: 1, max: NOTIFICATION.BODY_MAX }).optional(),
        enabled: z.boolean({ error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
    /** "Send one to me now" — an address or a phone the admin types. */
    test: z
      .object({
        channel: z.enum(NOTIFICATION.CHANNELS, { error: V.INVALID_TYPE }),
        to: z.string({ error: V.REQUIRED }).trim().min(3).max(254),
        lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .superRefine((v, ctx) => {
        const schema =
          v.channel === 'email' ? email : phone({ allowInternational: allowInternationalPhone });
        const parsed = schema.safeParse(v.to);
        if (!parsed.success)
          ctx.addIssue({ code: 'custom', path: ['to'], message: parsed.error.issues[0].message });
        else v.to = parsed.data;
      }),
    logQuery: z
      .object({
        page: z.coerce.number().int().min(1).max(10_000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        channel: z.enum(NOTIFICATION.CHANNELS, { error: V.INVALID_TYPE }).optional(),
        status: z.enum(NOTIFICATION.LOG_STATUSES, { error: V.INVALID_TYPE }).optional(),
      })
      .strict(),
  };
}
