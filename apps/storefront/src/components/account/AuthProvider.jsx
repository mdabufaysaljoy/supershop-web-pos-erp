'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { ACCOUNT_BASE, apiRequest, AUTH_BASE } from '@/lib/accountApi';

const AuthContext = createContext(null);

/**
 * The signed-in customer, for the whole storefront (P3.5). On load it tries ONE refresh call: the
 * httpOnly cookie either produces an access token (signed in) or it doesn't (guest) — pages stay
 * static and cacheable because nothing personal is rendered on the server.
 *
 * The access token is kept in a ref (not state): it changes often, and no UI depends on its value.
 */
export function AuthProvider({ children }) {
  const token = useRef(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | guest | signedIn
  const cart = useCart();

  const setSession = useCallback((session) => {
    token.current = session?.accessToken ?? null;
    setProfile(session?.profile ?? null);
    setStatus(session ? 'signedIn' : 'guest');
  }, []);

  /**
   * Exchanges the refresh cookie for an access token. Returns the token, or null for guests.
   *
   * Refresh tokens ROTATE and reuse is treated as theft (D-020), so two calls must never be in
   * flight with the same cookie — React’s double-mount in development would do exactly that.
   * Everyone who asks while a call is running waits for that one call.
   */
  const inFlight = useRef(null);
  const refresh = useCallback(() => {
    inFlight.current ??= apiRequest('POST', `${AUTH_BASE}/refresh`)
      .then((session) => {
        token.current = session.accessToken;
        return session.accessToken;
      })
      .catch(() => {
        token.current = null;
        return null;
      })
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, []);

  /** A call as the customer; a single retry after refreshing covers an expired access token. */
  const authed = useCallback(
    async (method, path, body) => {
      const call = (t) => apiRequest(method, path, { token: t, body });
      try {
        return await call(token.current ?? (await refresh()));
      } catch (err) {
        if (err.status !== 401) throw err;
        const fresh = await refresh();
        if (!fresh) {
          setSession(null);
          throw err;
        }
        return call(fresh);
      }
    },
    [refresh, setSession],
  );

  const loadProfile = useCallback(async () => {
    const me = await authed('GET', ACCOUNT_BASE);
    setProfile(me);
    setStatus('signedIn');
    return me;
  }, [authed]);

  // One attempt on mount: a valid cookie restores the session, anything else means "guest".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await refresh();
      if (cancelled) return;
      if (!t) return setStatus('guest');
      try {
        await loadProfile();
      } catch {
        if (!cancelled) setStatus('guest');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, loadProfile]);

  /** After signing in or out the cart changes owner (the API merges the guest cart). */
  const reloadCart = cart.reload;

  const value = useMemo(
    () => ({
      status,
      profile,
      isSignedIn: status === 'signedIn',
      authed,
      setProfile,
      signIn: async (identifier, password) => {
        const session = await apiRequest('POST', `${AUTH_BASE}/login`, {
          body: { identifier, password },
        });
        token.current = session.accessToken;
        setProfile(session.profile);
        setStatus('signedIn');
        await reloadCart();
        return session.profile;
      },
      register: async (body) => {
        const session = await apiRequest('POST', '/api/v1/customers/register', { body });
        token.current = session.accessToken;
        setProfile(session.profile);
        setStatus('signedIn');
        await reloadCart();
        return session.profile;
      },
      signOut: async () => {
        try {
          await apiRequest('POST', `${AUTH_BASE}/logout`);
        } finally {
          setSession(null);
          await reloadCart();
        }
      },
      reloadProfile: loadProfile,
    }),
    [status, profile, authed, loadProfile, reloadCart, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
