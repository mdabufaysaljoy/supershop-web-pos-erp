import express from 'express';
import { createPrintingSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './printing.controller.js';

/**
 * Mounted at `/api/v1/printing` — everything a till needs to print, and nothing a browser should
 * hold itself (P6.3).
 *
 *  GET  /status                pos.sell | settings.printing — is printing set up at all
 *  GET  /certificate           pos.sell | settings.printing — the certificate QZ Tray shows
 *  POST /sign                  pos.sell | settings.printing — signs ONE QZ call (rate-limited)
 *  GET  /profiles              pos.sell | settings.printing
 *  POST /profiles              settings.printing
 *  PATCH/DELETE /profiles/:id  settings.printing
 *  GET  /receipt/:id           pos.sell | order.view — the receipt for an order, as bytes
 */
export function createPrintingRouter({ schemas = createPrintingSchemas() } = {}) {
  const r = express.Router();
  const print = requireAnyPermission(P.POS_SELL, P.SETTINGS_PRINTING);
  const manage = requirePermission(P.SETTINGS_PRINTING);
  const id = validate({ params: schemas.idParam });

  r.get('/status', print, c.status);
  r.get('/certificate', print, c.certificate);
  r.post(
    '/sign',
    print,
    // A till signs a call per print; anything beyond that is not a counter at work.
    createRateLimiter({ name: 'qz-sign', ...LIMITS.print }),
    validate({ body: schemas.sign }),
    c.sign,
  );

  r.get('/profiles', print, validate({ query: schemas.listQuery }), c.listProfiles);
  r.get('/profiles/:id', print, id, c.getProfile);
  r.post('/profiles', manage, validate({ body: schemas.create }), c.createProfile);
  r.patch(
    '/profiles/:id',
    manage,
    validate({ params: schemas.idParam, body: schemas.update }),
    c.updateProfile,
  );
  r.delete('/profiles/:id', manage, id, c.deleteProfile);

  r.get(
    '/templates',
    requireAnyPermission(P.POS_SELL, P.SETTINGS_PRINTING, P.PRODUCT_VIEW),
    c.getTemplates,
  );
  r.patch(
    '/templates/receipt',
    manage,
    validate({ body: schemas.receiptTemplate }),
    c.updateReceiptTemplate,
  );
  r.patch(
    '/templates/label',
    manage,
    validate({ body: schemas.labelTemplate }),
    c.updateLabelTemplate,
  );

  r.get(
    '/receipt/:id',
    requireAnyPermission(P.POS_SELL, P.ORDER_VIEW),
    validate({ params: schemas.idParam, query: schemas.jobQuery }),
    c.receiptJob,
  );
  r.post(
    '/label',
    requireAnyPermission(P.POS_SELL, P.PRODUCT_VIEW, P.SETTINGS_PRINTING),
    validate({ body: schemas.labelJob }),
    c.labelJob,
  );
  return r;
}
