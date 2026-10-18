import { TrackingConsent, TrackingIntegration } from './tracking.model.js';

export async function listIntegrations() {
  return TrackingIntegration.find({}).lean();
}

export async function findIntegration(provider) {
  return TrackingIntegration.findOne({ provider }).lean();
}

export async function upsertIntegration(
  provider,
  { enabled, clientConfig, encryptedCredentials, events, updatedBy },
) {
  const update = {
    $set: {
      provider,
      ...(enabled !== undefined && { enabled }),
      ...(clientConfig !== undefined && { clientConfig }),
      ...(encryptedCredentials !== undefined && { encryptedCredentials }),
      ...(events !== undefined && { events }),
      updatedBy,
    },
  };

  return TrackingIntegration.findOneAndUpdate({ provider }, update, {
    returnDocument: 'after',
    upsert: true,
  }).lean();
}

export async function findConsentSettings() {
  const found = await TrackingConsent.findOne({ key: 'consent' }).lean();
  if (found) return found;

  // Defaults if never saved
  return {
    key: 'consent',
    enabled: true,
    defaultAnalytics: false,
    defaultMarketing: false,
    consentModeV2: true,
    privacyPolicyUrl: '/privacy',
  };
}

export async function upsertConsentSettings(data, updatedBy) {
  const update = {
    $set: {
      key: 'consent',
      ...data,
      updatedBy,
    },
  };

  return TrackingConsent.findOneAndUpdate({ key: 'consent' }, update, {
    returnDocument: 'after',
    upsert: true,
  }).lean();
}
