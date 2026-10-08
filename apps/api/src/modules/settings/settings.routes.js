import express from 'express';
import { PERMISSIONS as P, SETTING_GROUPS, validators } from '@supershop/shared';
import { z } from 'zod';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './settings.controller.js';

/**
 * Mounted at `/api/v1/settings`.
 *  GET   /public   no auth — public keys only (storefront bootstrap), cached 60 s
 *  GET   /         settings.view (?group=) — secrets masked, `editable` per group permission
 *  PATCH /         settings.view + the group's permission for each key;
 *                  body { changes: [{ key, value }] } (a list: setting keys contain dots, and the
 *                  unsafe-key guard rejects dotted object keys)
 *  POST  /reset    same permissions; body { keys: [...] } → back to defaults
 * Per-key value validation happens in the service (each key has its own schema).
 */
const groupQuery = z.object({ group: z.enum(Object.keys(SETTING_GROUPS)).optional() });
const { V } = validators;
const settingKey = z
  .string()
  .regex(/^[a-z]\w*(\.[a-z]\w*)+$/i)
  .max(100);
const updateBody = z.object({
  changes: z
    .array(z.object({ key: settingKey, value: z.unknown() }))
    .min(1)
    .max(100)
    .refine((list) => new Set(list.map((c) => c.key)).size === list.length, { error: V.DUPLICATE }),
});
const resetBody = z.object({ keys: z.array(settingKey).min(1).max(100) });

export function createSettingsRouter() {
  const r = express.Router();
  const view = requirePermission(P.SETTINGS_VIEW);
  r.get('/public', c.publicSettings);
  r.get('/', view, validate({ query: groupQuery }), c.list);
  r.patch('/', view, validate({ body: updateBody }), c.update);
  r.post('/reset', view, validate({ body: resetBody }), c.reset);
  return r;
}
