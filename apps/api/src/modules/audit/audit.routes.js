import express from 'express';
import { PERMISSIONS as P, validators } from '@supershop/shared';
import { z } from 'zod';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './audit.controller.js';
import { auditedEvents } from './audit.service.js';

/**
 * Mounted at `/api/v1/audit` — read-only.
 *  GET /   audit.view — filters: action, actorId, entityType, entityId, from, to (ISO dates)
 */
const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const listQuery = validators.paginationQuery({ sortable: ['at'], defaultSort: '-at' }).extend({
  action: z.enum(auditedEvents()).optional(),
  actorId: validators.objectId.optional(),
  entityType: z.enum(['staff', 'customer', 'role', 'setting', 'request']).optional(),
  entityId: z
    .string()
    .max(100)
    .regex(/^[\w.:-]+$/)
    .optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export function createAuditRouter() {
  const r = express.Router();
  r.get('/', requirePermission(P.AUDIT_VIEW), validate({ query: listQuery }), c.list);
  return r;
}
