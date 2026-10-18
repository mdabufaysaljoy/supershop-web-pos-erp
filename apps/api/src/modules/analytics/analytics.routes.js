import express from 'express';
import { createAnalyticsSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './analytics.controller.js';

const defaultSchemas = createAnalyticsSchemas();

export function createAnalyticsRouter({ schemas = defaultSchemas } = {}) {
  const r = express.Router();

  r.get(
    '/dashboard',
    requirePermission(P.DASHBOARD_VIEW),
    validate({ query: schemas.dashboardQuery }),
    c.getDashboard,
  );

  r.get(
    '/overview',
    requirePermission(P.DASHBOARD_VIEW),
    validate({ query: schemas.dashboardQuery }),
    c.getDashboard,
  );

  return r;
}
