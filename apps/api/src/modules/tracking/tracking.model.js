import mongoose from 'mongoose';
import { TRACKING_PROVIDERS } from '@supershop/shared';

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const trackingIntegrationSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      unique: true,
      enum: TRACKING_PROVIDERS,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    clientConfig: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    encryptedCredentials: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    events: {
      type: [String],
      default: () => [],
    },
    updatedBy: {
      type: ObjectId,
      ref: 'Staff',
      default: null,
    },
  },
  { collection: 'tracking_integrations', timestamps: true, minimize: false },
);

const trackingConsentSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'consent',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    defaultAnalytics: {
      type: Boolean,
      default: false,
    },
    defaultMarketing: {
      type: Boolean,
      default: false,
    },
    consentModeV2: {
      type: Boolean,
      default: true,
    },
    privacyPolicyUrl: {
      type: String,
      default: '/privacy',
    },
    updatedBy: {
      type: ObjectId,
      ref: 'Staff',
      default: null,
    },
  },
  { collection: 'tracking_consent_settings', timestamps: true, minimize: false },
);

export const TrackingIntegration = mongoose.model('TrackingIntegration', trackingIntegrationSchema);

export const TrackingConsent = mongoose.model('TrackingConsent', trackingConsentSchema);
