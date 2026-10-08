import express from 'express';
import { createProductTransferSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS as RATE } from '../../middleware/rateLimit.js';
import { singleFileUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as c from './transfer.controller.js';
import { LIMITS } from './transfer.service.js';

/**
 * Mounted at `/api/v1/product-transfers`.
 *  GET  /template?format=csv|xlsx   product.import — columns incl. custom fields (+ cost if permitted)
 *  POST /imports                     product.import — multipart `file` + mode (upsert|create) + dryRun → 202 job
 *  POST /exports                     product.export — { format, filters } → 202 job
 *  GET  /jobs?type=                  product.import | product.export — own recent jobs
 *  GET  /jobs/:id                    same — status, counts, validation report
 *  GET  /jobs/:id/download           product.export — export file (creator only, 24 h)
 */
export function createProductTransferRouter({ schemas = createProductTransferSchemas() } = {}) {
  const r = express.Router();
  const anyTransfer = requireAnyPermission(P.PRODUCT_IMPORT, P.PRODUCT_EXPORT);
  const perStaff = (name) =>
    createRateLimiter({ name, ...RATE.upload, key: (req) => req.access?.staffId });

  r.get(
    '/template',
    requirePermission(P.PRODUCT_IMPORT),
    validate({ query: schemas.templateQuery }),
    c.template,
  );
  r.post(
    '/imports',
    requirePermission(P.PRODUCT_IMPORT),
    perStaff('product-import'),
    singleFileUpload({ maxBytes: () => LIMITS.maxFileMb * 1024 * 1024 }),
    validate({ body: schemas.importFields }),
    c.startImport,
  );
  r.post(
    '/exports',
    requirePermission(P.PRODUCT_EXPORT),
    perStaff('product-export'),
    validate({ body: schemas.exportBody }),
    c.startExport,
  );
  r.get('/jobs', anyTransfer, validate({ query: schemas.jobsQuery }), c.list);
  r.get('/jobs/:id', anyTransfer, validate({ params: schemas.idParam }), c.get);
  r.get(
    '/jobs/:id/download',
    requirePermission(P.PRODUCT_EXPORT),
    validate({ params: schemas.idParam }),
    c.download,
  );
  return r;
}
