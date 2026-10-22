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
export function priceSale(lines, { orderDiscount = null, extraDiscount = 0, tax }) {
  const gross = lines.map((l) => l.unitPrice * l.qty);
  const lineDiscounts = lines.map((l, i) => discountAmount(l.discount, gross[i]));
  const afterLine = gross.map((g, i) => g - lineDiscounts[i]);
  const afterLineTotal = sumMinor(0, ...afterLine);
  /**
   * `extraDiscount` is money taken off the whole basket that is not a rule — loyalty points spent
   * at the till. It rides with the order discount so VAT, the receipt and the ledger all see the
   * same figure, and together they can never take off more than the goods cost.
   */
  const orderDiscountTotal = Math.min(
    afterLineTotal,
    discountAmount(orderDiscount, afterLineTotal) + Math.max(0, Math.round(extraDiscount)),
  );
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
 * Takes one more tender onto a ticket.
 *
 * Tenders ADD UP: what the cashier enters is what the customer handed over, so a method put on a
 * bill that is already settled is extra money, not a correction of the one before it. The excess
 * is change, and the cashier gives it out of the drawer.
 *
 * @param {{ method: string, amount: number }[]} payments  what is on the ticket
 * @param {{ method: string, amount: number, reference?: string }} tender
 * @returns {{ method: string, amount: number }[]} the new ticket
 */
export function addTender(payments, tender) {
  const amount = Math.max(0, Math.round(tender.amount ?? 0));
  return amount ? [...payments, { ...tender, amount }] : payments;
}

/**
 * Is there enough CASH on the ticket to hand the change back?
 *
 * Change comes out of the drawer, so it can only be given against cash that went into it. Paying
 * 115 by card on a 100 bill is not change, it is 15 charged to a card that has to be refunded
 * through the gateway — the till refuses that. Cash 100 plus 15 on a card, though, is a customer
 * who paid twice over and gets 15 back from the drawer.
 *
 * @param {{ amount: number, methodType?: string, type?: string }[]} payments
 * @param {number} total
 * @param {string[]} [changeTypes]  method types a drawer can hand back (cash)
 */
export function changeIsCovered(payments = [], total = 0, changeTypes = ['cash']) {
  const { change } = tenderSummary(total, payments);
  if (change <= 0) return true;
  const cash = payments
    .filter((p) => changeTypes.includes(p.methodType ?? p.type))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  return change <= cash;
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
