import express from 'express';
import { createI18nSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './admin.controller.js';

/**
 * Mounted at `/api/v1/i18n`.
 *  GET    /ui-overrides/:catalog/:lang              PUBLIC — { key: value } overlay (storefront, 60 s cache)
 *  GET    /overview                                  settings.view — provider, usage, content status, queue
 *  POST   /provider/test                             settings.languages — sample round trip
 *  GET    /glossary                                  settings.view
 *  POST   /glossary  · PATCH/DELETE /glossary/:id    settings.languages (bumps glossary version)
 *  GET    /admin/ui-overrides/:catalog/:lang         settings.view (with English fingerprints)
 *  PUT    /admin/ui-overrides/:catalog/:lang/:key    settings.languages { value, source }
 *  DELETE /admin/ui-overrides/:catalog/:lang/:key    settings.languages (revert to machine translation)
 *  POST   /retranslate                               settings.languages { scope }
 *  POST   /jobs/:id/retry · POST /jobs/retry-failed  settings.languages
 * Provider choice, URL, API key, budget, auto-detect and digit style are regular settings
 * (`PATCH /api/v1/settings`, group `languages`).
 */
export function createI18nAdminRouter() {
  const s = createI18nSchemas();
  const r = express.Router();
  const view = requirePermission(P.SETTINGS_VIEW);
  const manage = requirePermission(P.SETTINGS_VIEW, P.SETTINGS_LANGUAGES);

  r.get(
    '/ui-overrides/:catalog/:lang',
    validate({ params: s.uiOverrideListParams }),
    c.publicUiOverrides,
  );

  r.get('/overview', view, c.overview);
  r.post(
    '/provider/test',
    manage,
    createRateLimiter({ name: 'i18n-provider-test', ...LIMITS.sensitive, failClosed: true }),
    c.testProvider,
  );

  r.get('/glossary', view, c.listGlossary);
  r.post('/glossary', manage, validate({ body: s.glossaryCreate }), c.createGlossary);
  r.patch(
    '/glossary/:id',
    manage,
    validate({ params: s.glossaryIdParam, body: s.glossaryUpdate }),
    c.updateGlossary,
  );
  r.delete('/glossary/:id', manage, validate({ params: s.glossaryIdParam }), c.deleteGlossary);

  r.get(
    '/admin/ui-overrides/:catalog/:lang',
    view,
    validate({ params: s.uiOverrideListParams }),
    c.listUiOverrides,
  );
  r.put(
    '/admin/ui-overrides/:catalog/:lang/:key',
    manage,
    validate({ params: s.uiOverrideParams, body: s.uiOverrideBody }),
    c.setUiOverride,
  );
  r.delete(
    '/admin/ui-overrides/:catalog/:lang/:key',
    manage,
    validate({ params: s.uiOverrideParams }),
    c.removeUiOverride,
  );

  r.post('/retranslate', manage, validate({ body: s.retranslateBody }), c.retranslate);
  r.post('/jobs/retry-failed', manage, c.retryAllFailed);
  r.post('/jobs/:id/retry', manage, validate({ params: s.jobIdParam }), c.retryJob);
  return r;
}
