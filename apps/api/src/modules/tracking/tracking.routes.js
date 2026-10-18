import { Router } from 'express';
import {
  consentSettingsSchema,
  PERMISSIONS,
  updateTrackingIntegrationSchema,
} from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './tracking.controller.js';

export const router = Router();

// Public endpoint for storefront tag initialization and consent
router.get('/public', controller.getPublicConfig);

// Admin endpoints (require tracking.manage)
router.get('/', requirePermission(PERMISSIONS.TRACKING_MANAGE), controller.getAdminIntegrations);

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
