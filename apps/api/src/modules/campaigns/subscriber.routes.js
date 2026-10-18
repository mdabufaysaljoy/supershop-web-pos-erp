import express from 'express';
import { PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import * as c from './subscriber.controller.js';

export function createNewsletterRouter() {
  const r = express.Router();
  const limiter = createRateLimiter({
    name: 'newsletter-subscribe',
    ...LIMITS.sensitive,
    failClosed: true,
  });

  // Public newsletter opt-in
  r.post('/', limiter, c.subscribe);
  r.get('/', c.subscribe);

  return r;
}

export function createSubscribersRouter() {
  const r = express.Router();
  const limiter = createRateLimiter({
    name: 'subscribers-subscribe',
    ...LIMITS.sensitive,
    failClosed: true,
  });

  // Public subscription
  r.post('/', limiter, c.subscribe);

  // Admin subscriber management
  r.get('/', requirePermission(P.CAMPAIGN_VIEW), c.listSubscribers);
  r.patch('/:id', requirePermission(P.CAMPAIGN_MANAGE), c.updateSubscriber);
  r.delete('/:id', requirePermission(P.CAMPAIGN_MANAGE), c.deleteSubscriber);

  return r;
}
