import { EVENTS, PROVIDER_CONFIG_SCHEMAS, TRACKING_PROVIDERS } from '@supershop/shared';
import { decryptSecret, encryptSecret, maskSecret } from '../../core/crypto.js';
import { BadRequestError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import * as repo from './tracking.repo.js';

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
