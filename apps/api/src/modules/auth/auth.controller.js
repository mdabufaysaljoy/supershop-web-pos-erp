import { sendData, sendNoContent } from '../../core/http.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth.cookies.js';
import * as service from './auth.service.js';

/** Thin HTTP layer: parse (already validated) → service → respond. Factories bound to a principal type. */

/** @param {import('express').Request} req */
export const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
  requestId: req.id === undefined ? undefined : String(req.id),
});

/** Sends access token in the body, refresh token as an httpOnly cookie. */
export function sendSession(res, type, tokens, extra = {}, status = 200) {
  setRefreshCookie(res, type, tokens.refreshToken, tokens.refreshExpiresAt);
  return sendData(
    res,
    { accessToken: tokens.accessToken, tokenType: 'Bearer', expiresIn: tokens.expiresIn, ...extra },
    { status },
  );
}

export const login = (type) => async (req, res) => {
  const { password, ...rest } = req.valid.body;
  const identifier = rest.email ?? rest.identifier;
  const { profile, ...tokens } = await service.login(
    type,
    { identifier, password },
    requestContext(req),
  );
  sendSession(res, type, tokens, { profile });
};

export const refresh = (type) => async (req, res) => {
  try {
    const tokens = await service.refreshSession(
      type,
      readRefreshCookie(req, type),
      requestContext(req),
    );
    sendSession(res, type, tokens);
  } catch (err) {
    clearRefreshCookie(res, type);
    throw err;
  }
};

export const logout = (type) => async (req, res) => {
  await service.logout(type, readRefreshCookie(req, type), requestContext(req));
  clearRefreshCookie(res, type);
  sendNoContent(res);
};

export const logoutAll = (type) => async (req, res) => {
  await service.revokeAllSessions(type, req.auth.principalId, 'logout_all', {
    ctx: requestContext(req),
  });
  clearRefreshCookie(res, type);
  sendNoContent(res);
};

export const me = (type) => async (req, res) => {
  sendData(res, await service.getProfile(type, req.auth.principalId));
};

export const forgotPassword = (type) => async (req, res) => {
  await service.requestPasswordReset(type, req.valid.body.email, requestContext(req));
  // Same response whether or not the account exists.
  sendData(res, { status: 'accepted' }, { status: 202 });
};

export const resetPassword = (type) => async (req, res) => {
  await service.resetPassword(type, req.valid.body, requestContext(req));
  clearRefreshCookie(res, type);
  sendNoContent(res);
};

export const changePassword = (type) => async (req, res) => {
  await service.changePassword(type, req.auth, req.valid.body, requestContext(req));
  sendNoContent(res);
};

export const verifyEmail = (type) => async (req, res) => {
  await service.verifyEmail(type, req.valid.body.token, requestContext(req));
  sendNoContent(res);
};

export const resendVerification = (type) => async (req, res) => {
  await service.requestEmailVerification(type, req.auth.principalId, requestContext(req));
  sendData(res, { status: 'accepted' }, { status: 202 });
};
