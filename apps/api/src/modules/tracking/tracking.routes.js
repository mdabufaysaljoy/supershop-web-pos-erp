import { Router } from 'express';
import {
  consentSettingsSchema,
  PERMISSIONS,
  serverEventIngestSchema,
  testEventSchema,
  trackingLogIdParamSchema,
  trackingLogQuerySchema,
  updateTrackingIntegrationSchema,
} from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './tracking.controller.js';

export const router = Router();

// Public endpoint for storefront tag initialization and consent
router.get('/public', controller.getPublicConfig);

// Public endpoint for direct server-side event ingestion
router.post('/events', validate({ body: serverEventIngestSchema }), controller.ingestServerEvent);

// Admin endpoints (require tracking.manage)
router.get('/', requirePermission(PERMISSIONS.TRACKING_MANAGE), controller.getAdminIntegrations);

router.get(
  '/logs',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ query: trackingLogQuerySchema }),
  controller.queryTrackingLogs,
);

router.get(
  '/logs/:id',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ params: trackingLogIdParamSchema }),
  controller.getTrackingLog,
);

router.post(
  '/logs/:id/retry',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ params: trackingLogIdParamSchema }),
  controller.retryTrackingLog,
);

router.post(
  '/test',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ body: testEventSchema }),
  controller.dispatchTestEvent,
);

router.put(
  '/settings/consent',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ body: consentSettingsSchema }),
  controller.updateConsentSettings,
);

router.put(
  '/:provider',
  requirePermission(PERMISSIONS.TRACKING_MANAGE),
  validate({ body: updateTrackingIntegrationSchema }),
  controller.updateIntegration,
);
