import mongoose from 'mongoose';
import { CAMPAIGN, CUSTOMER_SEGMENTS } from '@supershop/shared';
import { localized, LocalizedString } from '../i18n/index.js';

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: CAMPAIGN.MAX_NAME_LENGTH },
    channel: { type: String, enum: CAMPAIGN.CHANNELS, required: true },
    segment: { type: String, enum: Object.values(CUSTOMER_SEGMENTS), required: true },
    status: { type: String, enum: CAMPAIGN.STATUSES, default: 'draft', index: true },
    subject: localizedField(),
    message: localizedField(),
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    stats: {
      targeted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    jobId: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'Staff', default: null },
  },
  { collection: 'campaigns', timestamps: true },
);

campaignSchema.plugin(localized, { fields: ['subject', 'message'] });
campaignSchema.index({ createdAt: -1 });

const deliverySchema = new Schema(
  {
    campaignId: { type: ObjectId, ref: 'Campaign', required: true, index: true },
    customerId: { type: ObjectId, ref: 'Customer', required: true, index: true },
    channel: { type: String, enum: CAMPAIGN.CHANNELS, required: true },
    recipient: { type: String, required: true, trim: true },
    lang: { type: String, default: 'en' },
    status: { type: String, enum: CAMPAIGN.DELIVERY_STATUSES, default: 'pending', index: true },
    provider: { type: String, default: null },
    providerRef: { type: String, default: null },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { collection: 'campaign_deliveries', timestamps: true },
);

deliverySchema.index({ campaignId: 1, customerId: 1 });
deliverySchema.index({ createdAt: -1 });

export const Campaign = mongoose.models.Campaign ?? mongoose.model('Campaign', campaignSchema);

export const CampaignDelivery =
  mongoose.models.CampaignDelivery ?? mongoose.model('CampaignDelivery', deliverySchema);
