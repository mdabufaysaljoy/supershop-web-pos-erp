import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuote } from './resource';

/**
 * The sale in progress (P6.2). It lives in the browser — a basket is not worth a round trip per
 * keystroke — but the MONEY never does: every change asks the server what it comes to, so the
 * screen and the receipt can never disagree (D-160).
 *
 * Held sales are kept per branch in localStorage, so a till that is reloaded, or a customer who
 * walks off to fetch something, loses nothing.
 */
const HELD_KEY = 'pos.held';
const QUOTE_DEBOUNCE_MS = 250;

const emptySale = () => ({
  lines: [],
  orderDiscount: null,
  customer: { mode: 'walkin' },
  note: '',
});

/** localStorage is per-browser and may be unavailable (private mode) — never let it break a sale. */
const readHeld = () => {
  try {
    const raw = localStorage.getItem(HELD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
const writeHeld = (list) => {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(list));
  } catch {
    // A till that cannot remember held sales still sells; nothing else depends on this.
  }
};

export function useSale(branchId) {
  const [sale, setSale] = useState(emptySale);
  const [held, setHeld] = useState(readHeld);
  const quote = useQuote();
  /** The last quote the SERVER gave us (lines + totals), kept while the next one is in flight. */
  const [quoted, setQuoted] = useState(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const timer = useRef(null);

  const body = useMemo(
    () => ({
      branchId,
      items: sale.lines.map((l) => ({
        variantId: l.variantId,
        qty: l.qty,
        ...(l.discount ? { discount: l.discount } : {}),
      })),
      ...(sale.orderDiscount ? { orderDiscount: sale.orderDiscount } : {}),
    }),
    [branchId, sale.lines, sale.orderDiscount],
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
          setQuoteFailed(false);
        })
        // Offline, or the server refused: keep showing what we had and say it is not confirmed.
        .catch(() => setQuoteFailed(true));
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [askForQuote, body, branchId, empty]);

  const addItem = useCallback((variant) => {
    setSale((current) => {
      const found = current.lines.find((l) => l.variantId === variant.variantId && !l.discount);
      const lines = found
        ? current.lines.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l))
        : [...current.lines, { ...variant, qty: 1, discount: null }];
      return { ...current, lines };
    });
  }, []);

  const setQty = useCallback((variantId, qty) => {
    setSale((current) => ({
      ...current,
      lines:
        qty > 0
          ? current.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l))
          : current.lines.filter((l) => l.variantId !== variantId),
    }));
  }, []);

  const setLineDiscount = useCallback((variantId, discount) => {
    setSale((current) => ({
      ...current,
      lines: current.lines.map((l) => (l.variantId === variantId ? { ...l, discount } : l)),
    }));
  }, []);

  const patch = useCallback((fields) => setSale((current) => ({ ...current, ...fields })), []);
  const clear = useCallback(() => setSale(emptySale()), []);

  const hold = useCallback(
    (label) => {
      if (!sale.lines.length) return;
      const next = [
        { id: crypto.randomUUID(), at: Date.now(), branchId, label, sale },
        ...held,
      ].slice(0, 20);
      setHeld(next);
      writeHeld(next);
      clear();
    },
    [branchId, clear, held, sale],
  );

  const resume = useCallback(
    (id) => {
      const entry = held.find((h) => h.id === id);
      if (!entry) return;
      setSale(entry.sale);
      const next = held.filter((h) => h.id !== id);
      setHeld(next);
      writeHeld(next);
    },
    [held],
  );

  const drop = useCallback(
    (id) => {
      const next = held.filter((h) => h.id !== id);
      setHeld(next);
      writeHeld(next);
    },
    [held],
  );

  return {
    sale,
    body,
    /** The server's own pricing of this basket: `{ items, totals, tender, methods }`. */
    priced: empty ? null : quoted,
    totals: empty ? null : (quoted?.totals ?? null),
    /** The totals on screen are the last confirmed ones, and something has changed since. */
    stale: !empty && quoteFailed,
    pricing: quote.isPending,
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
