import express from 'express';
import {
  createExportJobSchema,
  exportJobsQuerySchema,
  reportPresetSchema,
} from '@supershop/shared';
import { requireStaff } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS as RATE } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './export.controller.js';

export function createExportRouter() {
  const r = express.Router();
  const staff = requireStaff();
  const perStaff = (name) =>
    createRateLimiter({ name, ...RATE.upload, key: (req) => req.access?.staffId });

  // Job management
  r.post(
    '/',
    staff,
    perStaff('export-create'),
    validate({ body: createExportJobSchema }),
    c.createJob,
  );
  r.get('/jobs', staff, validate({ query: exportJobsQuerySchema }), c.listJobs);
  r.get('/jobs/:id', staff, c.getJob);
  r.get('/jobs/:id/download', staff, c.download);

  // Metadata for report builder and list export modals
  r.get('/resources', staff, c.getResources);

  // Report presets (saved templates)
  r.post('/presets', staff, validate({ body: reportPresetSchema }), c.createPreset);
  r.get('/presets', staff, c.listPresets);
  r.delete('/presets/:id', staff, c.deletePreset);

  return r;
}
