import express from 'express';
import { createNotificationSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './notification.controller.js';

/**
 * Mounted at `/api/v1/notifications` — all `settings.notifications`.
 *  GET   /templates        the shop's messages (English source + generated Arabic)
 *  PATCH /templates/:id    reword one or switch it off
 *  GET   /logs             what went out: ?page&limit&channel&status
 *  POST  /test             send one real message to an address the admin types (rate-limited)
 */
const defaults = createNotificationSchemas();

/** @param {{ schemas?: object, deps?: { fetchImpl?: typeof fetch } }} [opts] */
export function createNotificationRouter({ schemas = defaults, deps = {} } = {}) {
  const r = express.Router();
  r.use(requirePermission(P.SETTINGS_NOTIFICATIONS));

  r.get('/templates', c.listTemplates);
  r.patch(
    '/templates/:id',
    validate({ params: schemas.idParam, body: schemas.updateTemplate }),
    c.updateTemplate,
  );
  r.get('/logs', validate({ query: schemas.logQuery }), c.logs);
  r.post(
    '/test',
    createRateLimiter({ name: 'notification-test', ...LIMITS.sensitive, failClosed: true }),
    validate({ body: schemas.test }),
    c.test(deps),
  );
  return r;
}
