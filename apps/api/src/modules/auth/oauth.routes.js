import express from 'express';
import { z } from 'zod';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './oauth.controller.js';

/**
 * Mounted at `/api/v1/auth/customer/<provider>` (P3.5). Both routes are plain browser
 * navigations, so they answer with redirects — never JSON, never a token in a URL.
 *  GET /start?returnTo=/account   → the provider's consent screen
 *  GET /callback?code&state       → session cookie + redirect back into the storefront
 */
const startQuery = z.object({ returnTo: z.string().max(512).optional() }).loose();
const callbackQuery = z
  .object({
    code: z.string().max(2048).optional(),
    state: z.string().max(512).optional(),
    error: z.string().max(120).optional(),
  })
  .loose();

/** @param {string} provider  @param {{ fetchImpl?: typeof fetch }} [deps] tests inject a fake provider */
export function createOAuthRouter(provider, deps = {}) {
  const r = express.Router();
  const limit = createRateLimiter({ name: `oauth-${provider}`, ...LIMITS.oauth });
  r.get('/start', limit, validate({ query: startQuery }), c.start(provider, deps));
  r.get('/callback', limit, validate({ query: callbackQuery }), c.callback(provider, deps));
  return r;
}
