/**
 * Auth module — public API. Other modules import ONLY from here.
 */
export { createAuthRouter } from './auth.routes.js';
export { requireAuth } from './auth.middleware.js';
export { registerPrincipal } from './principals.js';
export { registerAuthSubscribers } from './auth.events.js';
export { sendSession, requestContext } from './auth.controller.js';
export { AUTH_BASE_PATH } from './auth.cookies.js';
export {
  issueSession,
  requestEmailVerification,
  revokeAllSessions,
  setPassword,
} from './auth.service.js';
