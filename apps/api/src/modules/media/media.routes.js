import express from 'express';
import { createMediaSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { singleFileUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { getSetting } from '../settings/index.js';
import * as c from './media.controller.js';

/**
 * Mounted at `/api/v1/media`.
 *  GET    /       media.manage | product.create | product.update | page.manage  (pickers)
 *  GET    /:id    same
 *  POST   /       same — multipart: `file` (+ optional `alt`); 201 new, 200 + meta.duplicate
 *  PATCH  /:id    media.manage — { alt?, name? }
 *  DELETE /:id    media.manage — soft delete
 * Files themselves are served by the storage adapter (`/media/...`), not by this router.
 */
export function createMediaRouter({ schemas = createMediaSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  // Product and page editors pick/upload images from their own screens.
  const use = requireAnyPermission(
    P.MEDIA_MANAGE,
    P.PRODUCT_CREATE,
    P.PRODUCT_UPDATE,
    P.PAGE_MANAGE,
  );
  const manage = requirePermission(P.MEDIA_MANAGE);
  const uploadLimit = createRateLimiter({
    name: 'media-upload',
    ...LIMITS.upload,
    key: (req) => req.access?.staffId,
  });

  r.get('/', use, validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', use, id, c.get);
  r.post(
    '/',
    use,
    uploadLimit,
    singleFileUpload({ maxBytes: () => getSetting('media.maxUploadMb') * 1024 * 1024 }),
    validate({ body: schemas.uploadFields }),
    c.upload,
  );
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, id, c.remove);
  return r;
}
