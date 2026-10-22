import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cartKey, heldKey, readJson, removeKey, writeJson } from './saleStorage';
import { useQuote } from './resource';

/**
 * The sale in progress. It lives in the browser — a basket is not worth a round trip per
 * keystroke — but the MONEY never does: every change asks the server what it comes to, so the
 * screen and the receipt can never disagree (D-160).
 *
 * It also SURVIVES: the basket and the held sales are written to `localStorage` under the
 * cashier's own key, so a reload, a walk to another screen, or a sign-out and back in finds the
 * counter exactly as it was left (D-175).
 */
const QUOTE_DEBOUNCE_MS = 250;
const MAX_HELD = 20;

const emptySale = () => ({
  lines: [],
  orderDiscount: null,
  customer: { mode: 'walkin' },
  /** Loyalty points the customer is spending on this sale — priced by the server (P7.1). */
  redeemPoints: 0,
  note: '',
});

/** Anything stored is the cashier's own input; a corrupt or half-written entry is dropped. */
const restoreSale = (stored) =>
  stored && Array.isArray(stored.lines)
    ? {
        ...emptySale(),
        ...stored,
        lines: stored.lines.filter((line) => line?.variantId && line?.qty > 0),
      }
    : emptySale();

/**
 * @param {string} branchId  the till's branch
 * @param {{ staffId?: string }} [opts]  whose basket this is (shared terminals keep them apart)
 */
export function useSale(branchId, { staffId = '' } = {}) {
  const key = cartKey(staffId, branchId);
  const [sale, setSale] = useState(emptySale);
  const [held, setHeld] = useState([]);
  const [restoredFor, setRestoredFor] = useState(null);
  const quote = useQuote();
  /** The last quote the SERVER gave us (lines + totals), kept while the next one is in flight. */
  const [quoted, setQuoted] = useState(null);
  /** The server's own words when it refused to price the basket (a discount over the cap, say). */
  const [quoteError, setQuoteError] = useState(null);
  const timer = useRef(null);

  // Restoring is keyed by cashier + branch: switching either loads that counter's own basket.
  if (restoredFor !== key) {
    setRestoredFor(key);
    setSale(restoreSale(readJson(key, null)));
    setHeld(readJson(heldKey(staffId), []));
    setQuoted(null);
  }

  const body = useMemo(
    () => ({
      branchId,
      items: sale.lines.map((l) => ({
        variantId: l.variantId,
        qty: l.qty,
        ...(l.discount ? { discount: l.discount } : {}),
      })),
      ...(sale.orderDiscount ? { orderDiscount: sale.orderDiscount } : {}),
      ...(sale.redeemPoints ? { redeemPoints: sale.redeemPoints } : {}),
    }),
    [branchId, sale.lines, sale.orderDiscount, sale.redeemPoints],
  );

  const { mutateAsync: askForQuote } = quote;
  const empty = sale.lines.length === 0;

  useEffect(() => {
    if (!branchId || empty) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      askForQuote(body)
        .then((result) => {
          setQuoted(result);
          setQuoteError(null);
        })
        // Offline, or the server refused: keep showing what we had and say it is not confirmed.
        .catch((err) => setQuoteError(err ?? new Error('quote failed')));
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [askForQuote, body, branchId, empty]);

  /**
   * Every change to the basket is written through, so a reload never loses one. It is done in an
   * effect, not inside the state updater: React invokes an updater twice in StrictMode, so an
   * updater that does anything besides return the next state — writing storage, or setting state
   * again — applies its change twice, and the first scan of an item used to ring up two of it.
   */
  useEffect(() => {
    if (restoredFor !== key) return;
    if (sale.lines.length || sale.customer?.mode === 'contact') writeJson(key, sale);
    else removeKey(key);
  }, [key, restoredFor, sale]);

  const update = useCallback((fn) => setSale(fn), []);

  const addItem = useCallback(
    (variant) =>
      update((current) => {
        const found = current.lines.find((l) => l.variantId === variant.variantId && !l.discount);
        const lines = found
          ? current.lines.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l))
          : [...current.lines, { ...variant, qty: 1, discount: null }];
        return { ...current, lines };
      }),
    [update],
  );

  const setQty = useCallback(
    (variantId, qty) =>
      update((current) => ({
        ...current,
        lines:
          qty > 0
            ? current.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l))
            : current.lines.filter((l) => l.variantId !== variantId),
      })),
    [update],
  );

  const setLineDiscount = useCallback(
    (variantId, discount) =>
      update((current) => ({
        ...current,
        lines: current.lines.map((l) => (l.variantId === variantId ? { ...l, discount } : l)),
      })),
    [update],
  );

  const patch = useCallback((fields) => update((current) => ({ ...current, ...fields })), [update]);

  const clear = useCallback(() => {
    setSale(emptySale());
    setQuoted(null);
  }, []);

  const saveHeld = useCallback(
    (list) => {
      setHeld(list);
      writeJson(heldKey(staffId), list);
    },
    [staffId],
  );

  /**
   * Puts the basket aside, WITH whoever it is for: the customer walks off to fetch one more
   * thing, the next person is served, and resuming brings the whole sale back.
   */
  const hold = useCallback(
    (label) => {
      if (!sale.lines.length) return null;
      const entry = {
        id: crypto.randomUUID(),
        at: Date.now(),
        branchId,
        label: label ?? '',
        total: quoted?.totals?.total ?? 0,
        sale,
      };
      saveHeld([...held, entry].slice(-MAX_HELD));
      clear();
      return entry;
    },
    [branchId, clear, held, quoted, sale, saveHeld],
  );

  /** Brings a held sale back. Whatever is on screen is held in its place, never dropped. */
  const resume = useCallback(
    (id) => {
      const entry = held.find((h) => h.id === id);
      if (!entry) return;
      const rest = held.filter((h) => h.id !== id);
      const parked = sale.lines.length
        ? [
            ...rest,
            {
              id: crypto.randomUUID(),
              at: Date.now(),
              branchId,
              label: '',
              total: quoted?.totals?.total ?? 0,
              sale,
            },
          ].slice(-MAX_HELD)
        : rest;
      saveHeld(parked);
      setQuoted(null);
      setSale(restoreSale(entry.sale));
    },
    [branchId, held, quoted, sale, saveHeld],
  );

  const drop = useCallback((id) => saveHeld(held.filter((h) => h.id !== id)), [held, saveHeld]);

  return {
    sale,
    body,
    /** The server's own pricing of this basket: `{ items, totals, tender, methods }`. */
    priced: empty ? null : quoted,
    totals: empty ? null : (quoted?.totals ?? null),
    /** The totals on screen are the last confirmed ones, and something has changed since. */
    stale: !empty && Boolean(quoteError),
    /** Why the last pricing attempt was refused, if it was — the till shows it in place of a guess. */
    quoteError: empty ? null : quoteError,
    pricing: quote.isPending,
    /** Oldest first: the queue is served in the order sales were put aside. */
    held: held.filter((h) => h.branchId === branchId),
    addItem,
    setQty,
    setLineDiscount,
    patch,
    clear,
    hold,
    resume,
    drop,
  };
}
