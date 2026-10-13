import { CART } from '@supershop/shared';
import { config } from '../../core/config.js';

/**
 * Guest cart cookie: an opaque random token (the DB keeps only its hash). httpOnly, SameSite=Lax
 * (survives arriving from a link), whole site, Secure + `__Host-` prefix in production (no Domain,
 * so it can't be set or read by other subdomains). Mutations are additionally CSRF-checked.
 */
export const CART_COOKIE = `${config.isProd ? '__Host-' : ''}ss_cart`;

const options = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: '/',
});

export const readCartToken = (req) => {
  const v = req.cookies?.[CART_COOKIE];
  return typeof v === 'string' && /^[\w-]{20,100}$/.test(v) ? v : null;
};

/** Applies a service result's cookie instruction. */
export function applyCartCookie(res, { cookie, token }) {
  if (cookie === 'set')
    res.cookie(CART_COOKIE, token, { ...options(), maxAge: CART.GUEST_TTL_DAYS * 86_400_000 });
  else if (cookie === 'clear') res.clearCookie(CART_COOKIE, options());
}
