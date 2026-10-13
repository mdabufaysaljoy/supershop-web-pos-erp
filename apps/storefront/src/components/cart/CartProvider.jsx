'use client';

import { createFormatters } from '@supershop/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLang } from '@/i18n/I18nProvider';
import { cartRequest } from '@/lib/cartApi';

const CartContext = createContext(null);

/**
 * Cart state for the whole storefront: loaded once on the client (pages stay cacheable), updated
 * from every API response (the server's revalidated view is the source of truth). Opening the
 * mini-cart after "add to cart" is handled here.
 */
export function CartProvider({ fmtOptions, children }) {
  const lang = useLang();
  const [cart, setCart] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(null);
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const latest = useRef(0);

  /** Runs a request; only the newest response updates the state (out-of-order replies ignored). */
  const run = useCallback(
    async (method, path, body) => {
      const n = (latest.current += 1);
      setPending((p) => p + 1);
      try {
        const view = await cartRequest(method, path, { lang, body });
        if (n === latest.current) {
          setCart(view);
          setError(null);
        }
        return { ok: true, view };
      } catch (err) {
        if (n === latest.current) setError(err.code);
        return { ok: false, error: err };
      } finally {
        setPending((p) => p - 1);
      }
    },
    [lang],
  );

  // Load the cart from the server once on the client (and again if the language changes).
  useEffect(() => {
    void run('GET', ''); // eslint-disable-line react-hooks/set-state-in-effect -- external fetch
  }, [run]);

  const value = useMemo(
    () => ({
      cart,
      fmt,
      busy: pending > 0,
      error,
      open,
      setOpen,
      count: cart?.totals.itemCount ?? 0,
      reload: () => run('GET', ''),
      /** Adds and (unless `open: false`, e.g. Buy now) opens the mini-cart. */
      add: async (variantId, qty = 1, { open: openAfter = true } = {}) => {
        const res = await run('POST', '/items', { variantId, qty });
        if (res.ok && openAfter) setOpen(true);
        return res;
      },
      setQty: (variantId, qty) => run('PATCH', `/items/${variantId}`, { qty }),
      remove: (variantId) => run('DELETE', `/items/${variantId}`),
    }),
    [cart, fmt, pending, error, open, run],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
