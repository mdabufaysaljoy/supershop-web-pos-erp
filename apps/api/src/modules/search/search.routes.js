import express from 'express';
import { createSearchSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './search.controller.js';

/**
 * Mounted at `/api/v1/search`.
 *  GET  /          PUBLIC — ?q&lang&categoryId&brands=id,id&minPrice&maxPrice&sort&page&limit → product
 *                  cards + meta { total, facets: { brands, categories, price } }
 *  GET  /suggest   PUBLIC — ?q&lang → typeahead (products + categories)
 *  GET  /status    product.update — index size, rebuild state
 *  POST /rebuild   product.update — full re-index in the background (202)
 */
export function createSearchRouter({ schemas = createSearchSchemas() } = {}) {
  const r = express.Router();
  const publicLimit = createRateLimiter({ name: 'search', ...LIMITS.search });
  r.get('/', publicLimit, validate({ query: schemas.searchQuery }), c.search);
  r.get('/suggest', publicLimit, validate({ query: schemas.suggestQuery }), c.suggest);
  r.get('/status', requirePermission(P.PRODUCT_UPDATE), c.status);
  r.post('/rebuild', requirePermission(P.PRODUCT_UPDATE), c.rebuild);
  return r;
}
