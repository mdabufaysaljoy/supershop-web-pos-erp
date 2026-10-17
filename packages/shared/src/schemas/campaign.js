import { z } from 'zod';
import { CAMPAIGN } from '../campaigns/campaigns.js';
import { CUSTOMER_SEGMENTS } from '../customers/segments.js';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { email, objectId, paginationQuery, phone, plainText } from '../validators/fields.js';

export function createCampaignSchemas({ allowInternationalPhone = false } = {}) {
  const channelSchema = z.enum(CAMPAIGN.CHANNELS, { error: V.INVALID_TYPE });
  const segmentSchema = z.enum(Object.values(CUSTOMER_SEGMENTS), { error: V.INVALID_TYPE });
  const statusSchema = z.enum(CAMPAIGN.STATUSES, { error: V.INVALID_TYPE });

  return {
    idParam: z.object({ id: objectId }),

    createCampaign: z
      .object({
        name: plainText({ min: 1, max: CAMPAIGN.MAX_NAME_LENGTH }),
        channel: channelSchema,
        segment: segmentSchema,
        subject: plainText({ max: CAMPAIGN.MAX_SUBJECT_LENGTH }).optional(),
        message: plainText({ min: 1, max: CAMPAIGN.MAX_MESSAGE_LENGTH }),
        scheduledAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .nullable()
          .refine((val) => !val || new Date(val).getTime() > Date.now() - 60_000, {
            message: 'Scheduled date must be in the future',
          }),
      })
      .strict()
      .superRefine((data, ctx) => {
        if (data.channel === 'email' && !data.subject?.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['subject'],
            message: 'Subject is required for email campaigns',
          });
        }
      }),

    updateCampaign: z
      .object({
        name: plainText({ min: 1, max: CAMPAIGN.MAX_NAME_LENGTH }).optional(),
        channel: channelSchema.optional(),
        segment: segmentSchema.optional(),
        subject: plainText({ max: CAMPAIGN.MAX_SUBJECT_LENGTH }).optional().nullable(),
        message: plainText({ min: 1, max: CAMPAIGN.MAX_MESSAGE_LENGTH }).optional(),
        scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),

    scheduleCampaign: z
      .object({
        scheduledAt: z
          .string({ error: V.REQUIRED })
          .datetime({ offset: true })
          .refine((val) => new Date(val).getTime() > Date.now(), {
            message: 'Scheduled date must be in the future',
          }),
      })
      .strict(),

    listQuery: paginationQuery({
      sortable: ['name', 'createdAt', 'scheduledAt', 'startedAt', 'completedAt', 'status'],
      defaultSort: '-createdAt',
    }).extend({
      q: plainText({ max: 100 }).optional(),
      channel: channelSchema.optional(),
      status: statusSchema.optional(),
      segment: segmentSchema.optional(),
    }),

    sendTest: z
      .object({
        channel: channelSchema,
        to: z.string({ error: V.REQUIRED }).trim().min(3).max(254),
        lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .superRefine((v, ctx) => {
        const targetSchema =
          v.channel === 'email' ? email : phone({ allowInternational: allowInternationalPhone });
        const parsed = targetSchema.safeParse(v.to);
        if (!parsed.success) {
          ctx.addIssue({ code: 'custom', path: ['to'], message: parsed.error.issues[0].message });
        } else {
          v.to = parsed.data;
        }
      }),

    optOut: z
      .object({
        token: z.string().trim().optional(),
        email: email.optional(),
        phone: phone({ allowInternational: allowInternationalPhone }).optional(),
        channel: z.enum(['email', 'sms', 'all']).default('all'),
      })
      .strict()
      .refine((v) => Boolean(v.token || v.email || v.phone), {
        message: 'Must provide token, email, or phone to opt out',
      }),
  };
}
