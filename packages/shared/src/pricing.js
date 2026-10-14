import { multiplyMinor, sumMinor, vatFromGross, vatFromNet } from './money.js';

/**
 * Price & VAT rules (pure; shared by cart, checkout and POS so every channel computes the same
 * numbers). Money is integer halalas. VAT is computed PER LINE (as printed on ZATCA invoices)
 * and summed.
 */

/** Product tax categories → VAT rate. New categories = add a rule here (no scattered ifs). */
export const TAX_CATEGORIES = Object.freeze(['standard', 'zero', 'exempt']);

/** @param {string} taxCategory  @param {{ standardRateBps: number }} rates */
export const vatRateFor = (taxCategory, { standardRateBps }) =>
  taxCategory === 'zero' || taxCategory === 'exempt' ? 0 : standardRateBps;

/**
 * @param {{ unitPrice: number, qty: number, taxCategory?: string }[]} lines
 * @param {{ vatRateBps: number, pricesIncludeVat: boolean }} tax
 * @returns {{ lines: { lineTotal: number, net: number, vat: number, gross: number }[],
 *   totals: { itemCount: number, subtotal: number, net: number, vat: number, total: number } }}
 *   `lineTotal`/`subtotal` are what the shop displays (gross when prices include VAT, else net).
 */
export function priceLines(lines, { vatRateBps, pricesIncludeVat }) {
  const priced = lines.map((l) => {
    const rate = vatRateFor(l.taxCategory ?? 'standard', { standardRateBps: vatRateBps });
    const amount = multiplyMinor(l.unitPrice, l.qty);
    if (pricesIncludeVat) {
      const vat = vatFromGross(amount, rate);
      return { lineTotal: amount, net: amount - vat, vat, gross: amount };
    }
    const vat = vatFromNet(amount, rate);
    return { lineTotal: amount, net: amount, vat, gross: sumMinor(amount, vat) };
  });
  const sum = (key) => (priced.length ? sumMinor(...priced.map((p) => p[key])) : 0);
  return {
    lines: priced,
    totals: {
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: sum('lineTotal'),
      net: sum('net'),
      vat: sum('vat'),
      total: sum('gross'),
    },
  };
}

/**
 * Delivery charge for an order: free when the fee is 0 or the items reach the free-delivery
 * threshold. Taxed delivery follows the same VAT convention as product prices.
 * @param {{ fee: number, itemsTotal: number, freeOver?: number, taxed?: boolean,
 *   vatRateBps: number, pricesIncludeVat: boolean }} p
 * @returns {{ gross: number, net: number, vat: number, free: boolean }}
 */
export function deliveryCharge({
  fee,
  itemsTotal,
  freeOver = 0,
  taxed = true,
  vatRateBps,
  pricesIncludeVat,
}) {
  const free = fee <= 0 || (freeOver > 0 && itemsTotal >= freeOver);
  if (free) return { gross: 0, net: 0, vat: 0, free: true };
  if (!taxed) return { gross: fee, net: fee, vat: 0, free: false };
  if (pricesIncludeVat) {
    const vat = vatFromGross(fee, vatRateBps);
    return { gross: fee, net: fee - vat, vat, free: false };
  }
  const vat = vatFromNet(fee, vatRateBps);
  return { gross: sumMinor(fee, vat), net: fee, vat, free: false };
}

/**
 * What a payment method adds to the bill (P4.2). A payment fee is a service the shop charges for,
 * so it carries VAT exactly like delivery: inclusive or exclusive per the store's price mode.
 * @param {{ fee: number, vatRateBps: number, pricesIncludeVat: boolean, taxed?: boolean }} input
 *   `fee` is already computed from the method (fixed + percentage) in minor units.
 * @returns {{ gross: number, net: number, vat: number }}
 */
export function paymentCharge({ fee, vatRateBps, pricesIncludeVat, taxed = true }) {
  if (fee <= 0) return { gross: 0, net: 0, vat: 0 };
  if (!taxed) return { gross: fee, net: fee, vat: 0 };
  if (pricesIncludeVat) {
    const vat = vatFromGross(fee, vatRateBps);
    return { gross: fee, net: fee - vat, vat };
  }
  const vat = vatFromNet(fee, vatRateBps);
  return { gross: sumMinor(fee, vat), net: fee, vat };
}
