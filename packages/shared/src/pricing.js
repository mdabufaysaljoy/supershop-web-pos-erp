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
