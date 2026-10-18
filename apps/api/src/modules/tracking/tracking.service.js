import {
  EVENTS,
  PROVIDER_CONFIG_SCHEMAS,
  TRACKING_PROVIDERS,
  generateEventId,
} from '@supershop/shared';
import { decryptSecret, encryptSecret, maskSecret } from '../../core/crypto.js';
import { BadRequestError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import * as repo from './tracking.repo.js';
import * as logRepo from './trackingLog.repo.js';
import {
  enqueueTrackingEvent,
  processTrackingJob,
  sanitizePayloadForLogging,
} from './tracking.jobs.js';

const aadFor = (provider, key) => `tracking:${provider}:${key}`;

/**
 * Checks if a string looks like a masked secret (e.g. ••••abcd or ***abcd).
 */
const isMasked = (val) => typeof val === 'string' && (val.includes('••') || val.includes('***'));

/**
 * Transforms an integration document for the admin view with masked credentials.
 */
function toAdminDto(doc) {
  const maskedCredentials = {};
  const encrypted = doc.encryptedCredentials ?? {};

  for (const [k, enc] of Object.entries(encrypted)) {
    if (!enc) continue;
    try {
      const plain = decryptSecret(enc, { aad: aadFor(doc.provider, k) });
      maskedCredentials[k] = maskSecret(plain);
    } catch {
      maskedCredentials[k] = '••••••••';
    }
  }

  return {
    provider: doc.provider,
    enabled: Boolean(doc.enabled),
    clientConfig: doc.clientConfig ?? {},
    credentials: maskedCredentials,
    events: doc.events ?? [],
    updatedAt: doc.updatedAt,
  };
}

/**
 * Transforms an integration document for public storefront use (no secrets!).
 */
function toPublicDto(doc) {
  return {
    provider: doc.provider,
    enabled: Boolean(doc.enabled),
    clientConfig: doc.clientConfig ?? {},
    events: doc.events ?? [],
  };
}

/**
 * Returns public configuration for storefront layout and script injection.
 */
export async function getPublicTrackingConfig() {
  const [integrations, consent] = await Promise.all([
    repo.listIntegrations(),
    repo.findConsentSettings(),
  ]);

  const enabled = integrations.filter((i) => i.enabled).map(toPublicDto);

  return {
    integrations: enabled,
    consent: {
      enabled: Boolean(consent.enabled),
      defaultAnalytics: Boolean(consent.defaultAnalytics),
      defaultMarketing: Boolean(consent.defaultMarketing),
      consentModeV2: Boolean(consent.consentModeV2),
      privacyPolicyUrl: consent.privacyPolicyUrl || '/privacy',
    },
  };
}

/**
 * Returns all integrations with masked credentials for admin panel.
 */
export async function getAdminIntegrations() {
  const [integrations, consent] = await Promise.all([
    repo.listIntegrations(),
    repo.findConsentSettings(),
  ]);

  const existingMap = new Map(integrations.map((i) => [i.provider, i]));

  // Ensure all known providers have an entry
  const all = TRACKING_PROVIDERS.map((provider) => {
    const existing = existingMap.get(provider);
    if (existing) return toAdminDto(existing);

    return {
      provider,
      enabled: false,
      clientConfig: {},
      credentials: {},
      events: [],
      updatedAt: null,
    };
  });

  return {
    integrations: all,
    consent: {
      enabled: Boolean(consent.enabled),
      defaultAnalytics: Boolean(consent.defaultAnalytics),
      defaultMarketing: Boolean(consent.defaultMarketing),
      consentModeV2: Boolean(consent.consentModeV2),
      privacyPolicyUrl: consent.privacyPolicyUrl || '/privacy',
      updatedAt: consent.updatedAt ?? null,
    },
  };
}

/**
 * Updates a tracking provider configuration.
 */
export async function updateIntegration(actor, provider, input) {
  if (!TRACKING_PROVIDERS.includes(provider)) {
    throw new BadRequestError(`Unknown tracking provider: ${provider}`);
  }

  // Optional: validate clientConfig if schema exists
  const configSchema = PROVIDER_CONFIG_SCHEMAS[provider];
  if (configSchema && input.clientConfig) {
    configSchema.parse({ ...input.clientConfig, ...(input.credentials ?? {}) });
  }

  const existing = (await repo.findIntegration(provider)) ?? {};
  const existingEncrypted = existing.encryptedCredentials ?? {};
  const newEncrypted = { ...existingEncrypted };

  if (input.credentials && typeof input.credentials === 'object') {
    for (const [k, val] of Object.entries(input.credentials)) {
      if (val === null || val === '') {
        delete newEncrypted[k];
      } else if (typeof val === 'string' && !isMasked(val)) {
        newEncrypted[k] = encryptSecret(val, { aad: aadFor(provider, k) });
      }
      // If isMasked(val), preserve existingEncrypted[k] unchanged
    }
  }

  const updated = await repo.upsertIntegration(provider, {
    enabled: input.enabled,
    clientConfig: input.clientConfig,
    encryptedCredentials: newEncrypted,
    events: input.events,
    updatedBy: actor.staffId,
  });

  void eventBus.emit(EVENTS.TRACKING_INTEGRATION_UPDATED, {
    provider,
    enabled: updated.enabled,
    actorId: actor.staffId,
  });

  return toAdminDto(updated);
}

/**
 * Updates PDPL consent banner configuration.
 */
export async function updateConsentSettings(actor, input) {
  const updated = await repo.upsertConsentSettings(input, actor.staffId);

  void eventBus.emit(EVENTS.TRACKING_CONSENT_UPDATED, {
    enabled: updated.enabled,
    actorId: actor.staffId,
  });

  return {
    enabled: Boolean(updated.enabled),
    defaultAnalytics: Boolean(updated.defaultAnalytics),
    defaultMarketing: Boolean(updated.defaultMarketing),
    consentModeV2: Boolean(updated.consentModeV2),
    privacyPolicyUrl: updated.privacyPolicyUrl || '/privacy',
    updatedAt: updated.updatedAt,
  };
}

/**
 * Internal helper for P9.2 to retrieve decrypted credentials for server-side dispatch.
 */
export async function getDecryptedCredentials(provider) {
  const doc = await repo.findIntegration(provider);
  if (!doc) return null;

  const decrypted = {};
  for (const [k, enc] of Object.entries(doc.encryptedCredentials ?? {})) {
    if (!enc) continue;
    try {
      decrypted[k] = decryptSecret(enc, { aad: aadFor(provider, k) });
    } catch {
      decrypted[k] = null;
    }
  }

  return {
    provider: doc.provider,
    enabled: Boolean(doc.enabled),
    clientConfig: doc.clientConfig ?? {},
    credentials: decrypted,
    events: doc.events ?? [],
  };
}

/**
 * Queries tracking event logs for the admin viewer.
 */
export async function queryTrackingLogs(query) {
  return logRepo.queryLogs(query);
}

/**
 * Gets a single tracking event log with full payload and response.
 */
export async function getTrackingLog(id) {
  const log = await logRepo.findLogById(id);
  if (!log) {
    throw new NotFoundError('Tracking event log not found');
  }
  return log;
}

/**
 * Retries a failed tracking event log.
 */
export async function retryTrackingLog(id, { fetchImpl } = {}) {
  const log = await logRepo.findLogById(id);
  if (!log) {
    throw new NotFoundError('Tracking event log not found');
  }

  // Update status back to pending
  await logRepo.updateLog(id, {
    status: 'pending',
    errorMessage: null,
  });

  // Re-run dispatch
  try {
    await processTrackingJob(
      {
        data: {
          logId: String(log._id),
          provider: log.provider,
          event: log.event,
          eventId: log.eventId,
          orderNumber: log.orderNumber,
          payload: log.payload,
          isTest: log.isTest,
          testEventCode: log.testEventCode,
        },
      },
      { fetchImpl },
    );
  } catch {
    // Error is already recorded on log by processTrackingJob
  }

  return logRepo.findLogById(id);
}

/**
 * Dispatches an on-demand test event from admin panel.
 */
export async function dispatchTestEvent(input, { fetchImpl } = {}) {
  const {
    provider,
    event = 'purchase',
    testEventCode,
    orderNumber,
    value = 100,
    currency = 'SAR',
  } = input;

  if (!TRACKING_PROVIDERS.includes(provider)) {
    throw new BadRequestError(`Unknown tracking provider: ${provider}`);
  }

  const eventId = `test_${generateEventId()}`;
  const testOrderNo = orderNumber || `TEST-${Date.now().toString(36).toUpperCase()}`;

  const testPayload = {
    event,
    eventId,
    orderNumber: testOrderNo,
    value,
    currency,
    items: [
      {
        item_id: 'TEST-SKU-1',
        item_name: 'Test Product',
        price: value,
        quantity: 1,
      },
    ],
    customer: {
      email: 'test@example.com',
      phone: '0501234567',
      name: 'Test Customer',
    },
    attribution: {
      landingPage: 'https://supershop.example/test',
      clientUserAgent: 'SuperShop-Admin-TestRunner/1.0',
    },
  };

  const sanitizedPayload = sanitizePayloadForLogging(testPayload);

  const log = await logRepo.createLog({
    provider,
    event,
    eventId,
    orderNumber: testOrderNo,
    status: 'pending',
    payload: sanitizedPayload,
    isTest: true,
    testEventCode: testEventCode || null,
  });

  try {
    const result = await processTrackingJob(
      {
        data: {
          logId: String(log._id),
          provider,
          event,
          eventId,
          orderNumber: testOrderNo,
          payload: testPayload,
          isTest: true,
          testEventCode,
        },
      },
      { fetchImpl },
    );

    const updated = await logRepo.findLogById(log._id);
    return {
      success: true,
      log: updated,
      result,
    };
  } catch (err) {
    const updated = await logRepo.findLogById(log._id);
    return {
      success: false,
      log: updated,
      error: err.message,
    };
  }
}

/**
 * Direct public server-side event ingestion endpoint.
 */
export async function ingestServerEvent(input) {
  const eventId = input.eventId || generateEventId();
  const integrations = await repo.listIntegrations();
  const activeProviders = integrations
    .filter((i) => i.enabled && (i.events || []).includes(input.event))
    .map((i) => i.provider);

  const eventData = {
    ...input,
    eventId,
  };

  for (const provider of activeProviders) {
    void enqueueTrackingEvent({
      provider,
      event: input.event,
      eventId,
      orderNumber: input.orderNumber,
      payload: eventData,
    });
  }

  return {
    enqueued: true,
    eventId,
    dispatchedTo: activeProviders,
  };
}
