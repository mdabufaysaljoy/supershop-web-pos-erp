import { allocate, sumMinor } from '../money.js';
import { priceLines } from '../pricing.js';

/**
 * POS sale maths (P6.1). Pure, because this is where a shop's money is decided: the counter
 * computes a total, the service recomputes the same one, and a return (P6.6) reverses exactly what
 * was charged — so every number comes from here and nowhere else.
 */
export const POS = Object.freeze({
  /** A discount is a percentage (basis points, like every other rate) or money off. */
  DISCOUNT_TYPES: Object.freeze(['percent', 'amount']),
  /** Walk-in: nobody attached. Contact: a name/phone/email typed at the counter. */
  CUSTOMER_MODES: Object.freeze(['walkin', 'contact']),
  MAX_PAYMENTS: 4,
  MAX_LINES: 100,
  MAX_QTY: 999,
});

/**
 * What a discount takes off a base amount, never more than the base and never negative.
 * @param {{ type: string, value: number } | null | undefined} discount  value in bps or halalas
 * @param {number} base
 */
export function discountAmount(discount, base) {
  if (!discount?.value || base <= 0) return 0;
  const raw =
    discount.type === 'percent'
      ? Math.round((base * discount.value) / 10_000)
      : Math.round(discount.value);
  return Math.min(Math.max(raw, 0), base);
}

/**
 * Prices a sale: each line's own discount first, then an order-level discount spread across what
 * is left, so every line carries its share and its VAT is right.
 *
 * @param {{ unitPrice: number, qty: number, taxCategory?: string,
 *   discount?: { type: string, value: number } | null }[]} lines
 * @param {{ orderDiscount?: { type: string, value: number } | null,
 *   tax: { vatRateBps: number, pricesIncludeVat: boolean } }} opts
 */
export function priceSale(lines, { orderDiscount = null, tax }) {
  const gross = lines.map((l) => l.unitPrice * l.qty);
  const lineDiscounts = lines.map((l, i) => discountAmount(l.discount, gross[i]));
  const afterLine = gross.map((g, i) => g - lineDiscounts[i]);
  const orderDiscountTotal = discountAmount(orderDiscount, sumMinor(0, ...afterLine));
  // Largest-remainder, so the parts add up to the discount exactly — no halala lost or invented
  // between the receipt and the ledger.
  const spread =
    orderDiscountTotal > 0 ? allocate(orderDiscountTotal, afterLine) : afterLine.map(() => 0);

  // VAT is computed on what the customer actually pays for each line, by the one pricing helper.
  const priced = priceLines(
    lines.map((l, i) => ({
      unitPrice: afterLine[i] - spread[i],
      qty: 1,
      taxCategory: l.taxCategory,
    })),
    tax,
  );

  const out = lines.map((l, i) => ({
    unitPrice: l.unitPrice,
    qty: l.qty,
    taxCategory: l.taxCategory ?? 'standard',
    discount: l.discount ?? null,
    /** This line's share of every discount, line-level and order-level. */
    discountTotal: lineDiscounts[i] + spread[i],
    lineTotal: priced.lines[i].lineTotal,
    net: priced.lines[i].net,
    vat: priced.lines[i].vat,
  }));

  return {
    lines: out,
    totals: {
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      /** What the goods cost before any discount — what a receipt shows struck through. */
      subtotal: sumMinor(0, ...gross),
      discountTotal: sumMinor(0, ...lineDiscounts) + orderDiscountTotal,
      net: priced.totals.net,
      vat: priced.totals.vat,
      total: priced.totals.total,
    },
  };
}

/**
 * Takes one more tender onto a ticket, and keeps the ticket honest.
 *
 * A cashier settles the whole bill with one tap — card for the lot — and the customer then says
 * "put fifty on cash". The fifty is not EXTRA money: it comes OUT of the card. So a tender that
 * would overpay first takes back what it needs from the tenders that were tapped to settle the
 * balance (`auto`), oldest first, and any that fall to nothing are dropped.
 *
 * What the cashier typed by hand is never rewritten: once the auto tenders are used up, the new
 * tender is capped at what is still owed — unless it is cash, which may be handed over long and
 * comes back as change (D-163).
 *
 * @param {{ method: string, amount: number, auto?: boolean }[]} payments  what is on the ticket
 * @param {{ method: string, amount: number, reference?: string, auto?: boolean }} tender
 * @param {number} total  the sale's total
 * @param {{ takesChange?: boolean }} [opts]  true for cash: an overpayment is change, not an error
 * @returns {{ method: string, amount: number }[]} the new ticket
 */
export function addTender(payments, tender, total, { takesChange = false } = {}) {
  const wanted = Math.max(0, Math.round(tender.amount ?? 0));
  if (!wanted) return payments;

  const { due } = tenderSummary(total, payments);
  let over = wanted - due;
  if (over <= 0) return [...payments, { ...tender, amount: wanted }];

  // Carve the excess out of the tenders that were only holding the balance, oldest first.
  const rest = payments.map((p) => ({ ...p }));
  for (const p of rest) {
    if (over <= 0) break;
    if (!p.auto) continue;
    const taken = Math.min(p.amount, over);
    p.amount -= taken;
    over -= taken;
  }
  const kept = rest.filter((p) => p.amount > 0);
  // Anything still over is a genuine overpayment: cash gives change, everything else is capped.
  const amount = takesChange ? wanted : wanted - over;
  return amount > 0 ? [...kept, { ...tender, amount }] : kept;
}

/**
 * What has been tendered against a total: what is still due, and what to hand back.
 * @param {number} total
 * @param {{ amount: number }[]} payments
 */
export function tenderSummary(total, payments = []) {
  const paid = payments.length ? sumMinor(0, ...payments.map((p) => p.amount)) : 0;
  return { paid, due: Math.max(0, total - paid), change: Math.max(0, paid - total) };
}
