import { QUEUE_NAMES, enqueue, registerWorker } from '../../core/queue.js';
import { logger } from '../../core/logger.js';
import { sha256 } from '../../core/crypto.js';
import { normalizePhoneForTracking } from '@supershop/shared';
import { getAdapter } from './adapters/index.js';
import { findConsentSettings } from './tracking.repo.js';
import { getDecryptedCredentials } from './tracking.service.js';
import * as logRepo from './trackingLog.repo.js';

/**
 * Sanitizes customer PII for safe persistence in event logs.
 * SHA-256 hashes email, phone, and name.
 */
export function sanitizePayloadForLogging(payload = {}) {
  const sanitized = { ...payload };

  if (sanitized.customer) {
    const cust = { ...sanitized.customer };
    if (cust.email) cust.email = sha256(cust.email.trim().toLowerCase());
    if (cust.phone) cust.phone = sha256(normalizePhoneForTracking(cust.phone));
    if (cust.name) cust.name = sha256(cust.name.trim().toLowerCase());
    if (cust.firstName) cust.firstName = sha256(cust.firstName.trim().toLowerCase());
    if (cust.lastName) cust.lastName = sha256(cust.lastName.trim().toLowerCase());
    sanitized.customer = cust;
  }

  return sanitized;
}

/**
 * Enqueues a server-side tracking event for background dispatch.
 * Creates an initial TrackingEventLog entry with status 'pending'.
 */
export async function enqueueTrackingEvent(eventData, opts = {}) {
  const { provider, event, eventId, orderNumber, isTest, testEventCode } = eventData;

  // Persist sanitized log immediately
  const sanitizedPayload = sanitizePayloadForLogging(eventData.payload);
  let log = await logRepo.findLogByEvent(provider, event, eventId);
  if (!log) {
    log = await logRepo.createLog({
      provider,
      event,
      eventId,
      orderNumber: orderNumber || null,
      status: 'pending',
      payload: sanitizedPayload,
      isTest: Boolean(isTest),
      testEventCode: testEventCode || null,
    });
  }

  const jobName = `${provider}.${event}`;
  const jobId = `${provider}.${event}.${eventId}`;

  return enqueue(
    QUEUE_NAMES.TRACKING,
    jobName,
    {
      logId: String(log._id || log.id),
      provider,
      event,
      eventId,
      orderNumber,
      payload: eventData.payload, // raw payload passed to worker for platform hashing
      isTest: Boolean(isTest),
      testEventCode,
      consent: eventData.consent,
    },
    {
      jobId,
      ...opts,
    },
  ).catch((err) => {
    logger.error(
      { err: { message: err.message }, provider, event, eventId },
      'tracking event could not be queued',
    );
  });
}

/**
 * Executes tracking event dispatch directly or as a BullMQ worker processor.
 */
export async function processTrackingJob(job, { fetchImpl } = {}) {
  const data = job.data || job;
  const { logId, provider, event, eventId, orderNumber, payload, isTest, testEventCode, consent } =
    data;

  const integration = await getDecryptedCredentials(provider);

  // Check integration existence & enabled state
  if (!integration || !integration.enabled) {
    if (logId) {
      await logRepo.updateLog(logId, {
        status: 'skipped',
        skipReason: 'provider_disabled',
      });
    }
    return { status: 'skipped', reason: 'provider_disabled' };
  }

  // Check if specific event is enabled for this provider
  if (Array.isArray(integration.events) && !integration.events.includes(event)) {
    if (logId) {
      await logRepo.updateLog(logId, {
        status: 'skipped',
        skipReason: 'event_not_enabled',
      });
    }
    return { status: 'skipped', reason: 'event_not_enabled' };
  }

  // Check PDPL Consent gating
  const consentSettings = await findConsentSettings();
  if (consentSettings && consentSettings.enabled && consent) {
    const requiredCategory = provider === 'ga4' ? 'analytics' : 'marketing';
    if (consent[requiredCategory] === false) {
      if (logId) {
        await logRepo.updateLog(logId, {
          status: 'skipped',
          skipReason: 'consent_denied',
        });
      }
      return { status: 'skipped', reason: 'consent_denied' };
    }
  }

  const adapter = getAdapter(provider);
  if (!adapter) {
    const errorMsg = `No adapter found for tracking provider: ${provider}`;
    if (logId) {
      await logRepo.updateLog(logId, {
        status: 'failed',
        errorMessage: errorMsg,
      });
    }
    throw new Error(errorMsg);
  }

  const startTime = Date.now();
  try {
    const result = await adapter({
      config: integration.clientConfig,
      credentials: integration.credentials,
      payload: {
        ...payload,
        event,
        eventId,
        orderNumber,
        isTest,
        testEventCode,
      },
      options: {
        fetchImpl,
        isTest,
        testEventCode,
      },
    });

    const latencyMs = Date.now() - startTime;
    if (logId) {
      await logRepo.updateLog(logId, {
        status: 'success',
        attempts: (job.attemptsMade ?? 0) + 1,
        latencyMs,
        response: result.response ?? null,
        errorMessage: null,
      });
    }

    return result;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    if (logId) {
      await logRepo.updateLog(logId, {
        status: 'failed',
        attempts: (job.attemptsMade ?? 0) + 1,
        latencyMs,
        errorMessage: err.message,
        response: err.response ?? null,
      });
    }

    // Re-throw so BullMQ retries on network/transient failures
    throw err;
  }
}

let started = false;

/**
 * Starts BullMQ tracking queue worker.
 * Idempotent. Called on server startup.
 */
export function startTrackingWorkers({ fetchImpl } = {}) {
  if (started) return;
  started = true;

  const processor = (job) => processTrackingJob(job, { fetchImpl });
  registerWorker(QUEUE_NAMES.TRACKING, processor, { concurrency: 5 });
}
