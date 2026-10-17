import express from 'express';
import { createCampaignSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './campaign.controller.js';

const defaultSchemas = createCampaignSchemas();

export function createCampaignRouter({ schemas = defaultSchemas } = {}) {
  const r = express.Router();

  // Public unsubscribe endpoints (GET for email links, POST for programmatic opt-out)
  r.get('/unsubscribe', c.unsubscribe);
  r.post('/unsubscribe', validate({ body: schemas.optOut }), c.unsubscribe);

  // Audience preview (campaign.view)
  r.get('/audience-count', requirePermission(P.CAMPAIGN_VIEW), c.getAudienceCount);

  // List & detail (campaign.view)
  r.get(
    '/',
    requirePermission(P.CAMPAIGN_VIEW),
    validate({ query: schemas.listQuery }),
    c.listCampaigns,
  );
  r.get(
    '/:id',
    requirePermission(P.CAMPAIGN_VIEW),
    validate({ params: schemas.idParam }),
    c.getCampaign,
  );
  r.get(
    '/:id/deliveries',
    requirePermission(P.CAMPAIGN_VIEW),
    validate({ params: schemas.idParam }),
    c.listDeliveries,
  );

  // Create & Edit (campaign.manage)
  r.post(
    '/',
    requirePermission(P.CAMPAIGN_MANAGE),
    validate({ body: schemas.createCampaign }),
    c.createCampaign,
  );
  r.patch(
    '/:id',
    requirePermission(P.CAMPAIGN_MANAGE),
    validate({ params: schemas.idParam, body: schemas.updateCampaign }),
    c.updateCampaign,
  );

  // Test send (campaign.manage)
  r.post(
    '/:id/test',
    requirePermission(P.CAMPAIGN_MANAGE),
    createRateLimiter({ name: 'campaign-test', ...LIMITS.sensitive, failClosed: true }),
    validate({ params: schemas.idParam, body: schemas.sendTest }),
    c.sendTestCampaign,
  );

  // Schedule (campaign.manage)
  r.post(
    '/:id/schedule',
    requirePermission(P.CAMPAIGN_MANAGE),
    validate({ params: schemas.idParam, body: schemas.scheduleCampaign }),
    c.scheduleCampaign,
  );

  // Cancel (campaign.manage)
  r.post(
    '/:id/cancel',
    requirePermission(P.CAMPAIGN_MANAGE),
    validate({ params: schemas.idParam }),
    c.cancelCampaign,
  );

  // Send immediately (campaign.send)
  r.post(
    '/:id/send',
    requirePermission(P.CAMPAIGN_SEND),
    validate({ params: schemas.idParam }),
    c.sendCampaign,
  );

  return r;
}
