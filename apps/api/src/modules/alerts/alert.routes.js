import express from 'express';
import { z } from 'zod';
import { requireStaff } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './alert.controller.js';

/**
 * Mounted at `/api/v1/alerts` — the bell in the admin.
 *  GET  /        any active staff — the recent notices THEY may see, and how many are unread
 *  POST /read    any active staff — marks them read (all of them, or the ids given)
 */
export function createAlertRouter() {
  const r = express.Router();
  r.get(
    '/',
    requireStaff(),
    validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
    c.list,
  );
  r.post(
    '/read',
    requireStaff(),
    validate({ body: z.object({ ids: z.array(z.string()).max(50).optional() }).strict() }),
    c.markRead,
  );
  return r;
}
