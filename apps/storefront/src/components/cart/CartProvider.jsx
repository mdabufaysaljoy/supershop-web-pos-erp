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
import { trackAddToCart, trackRemoveFromCart } from '@/lib/tracking';

const defaultCartContext = {
  cart: null,
  open: false,
  setOpen: () => {},
  busy: false,
  saving: false,
  error: null,
  items: [],
  totalCount: 0,
  subtotal: 0,
  fmt: { money: (v) => `${(v ?? 0) / 100}` },
  add: async () => ({ ok: false }),
  setQty: async () => ({ ok: false }),
  remove: async () => ({ ok: false }),
};

const CartContext = createContext(defaultCartContext);

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
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState(null);
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const latest = useRef(0);

  /** Runs a request; only the newest response updates the state (out-of-order replies ignored). */
  const run = useCallback(
    async (method, path, body) => {
      const n = (latest.current += 1);
      setPending((p) => p + 1);
      if (method !== 'GET') setSaving((p) => p + 1);
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
        if (method !== 'GET') setSaving((p) => p - 1);
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
      /** A change is being saved — buttons that would change the cart wait for it. */
      busy: saving > 0,
      /** The first read hasn't finished; the cart is unknown, not empty. */
      loading: cart === null && pending > 0,
      error,
      open,
      setOpen,
      count: cart?.totals.itemCount ?? 0,
      reload: () => run('GET', ''),
      /** Adds and (unless `open: false`, e.g. Buy now) opens the mini-cart. */
      add: async (variantId, qty = 1, { open: openAfter = true } = {}) => {
        const res = await run('POST', '/items', { variantId, qty });
        if (res.ok) {
          const item = res.view?.items?.find((i) => i.variantId === variantId);
          if (item) {
            trackAddToCart({
              item: {
                item_id: item.variantId,
                item_name: item.name,
                price: (item.price ?? 0) / 100,
                quantity: qty,
              },
              currency: 'SAR',
            });
          }
          if (openAfter) setOpen(true);
        }
        return res;
      },
      setQty: (variantId, qty) => run('PATCH', `/items/${variantId}`, { qty }),
      remove: async (variantId) => {
        const item = cart?.items?.find((i) => i.variantId === variantId);
        const res = await run('DELETE', `/items/${variantId}`);
        if (res.ok && item) {
          trackRemoveFromCart({
            item: {
              item_id: item.variantId,
              item_name: item.name,
              price: (item.price ?? 0) / 100,
              quantity: item.qty,
            },
            currency: 'SAR',
          });
        }
        return res;
      },
    }),
    [cart, fmt, pending, saving, error, open, run],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  return ctx || defaultCartContext;
}
