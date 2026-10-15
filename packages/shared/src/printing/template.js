import { formatMoney } from '../money.js';
import { charsForWidth, renderEscPos } from './escpos.js';

/**
 * Receipt and label templates (P6.3). A template is a list of instructions with `{{fields}}` in
 * the text; the shop edits that list in P6.4 and nothing here changes.
 *
 * Rendering is pure: template + sale → ESC/POS bytes. Money is formatted ONCE, from the figures
 * the order carries, so the paper can never disagree with what was charged.
 */

/** `{{customer.name}}` → the value, missing fields become ''. Never evaluates anything. */
export function fill(text, data) {
  return String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((at, key) => (at == null ? at : at[key]), data);
    return value == null ? '' : String(value);
  });
}

/**
 * A sale as a receipt sees it: already formatted, so the template only places things.
 * @param {object} order   the POS sale (or any order) DTO
 * @param {{ shop: object, currency?: string, lang?: string }} ctx
 */
export function receiptData(
  order,
  { shop = {}, currency = 'SAR', lang = 'en', timeZone = 'Asia/Riyadh' } = {},
) {
  const money = (amount) => formatMoney(amount ?? 0, { currency, lang });
  /** Short and in the shop's own time: a receipt has one line for this, not a timestamp. */
  const when = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(`${lang}-SA`, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone,
          numberingSystem: 'latn',
          calendar: 'gregory',
        }).format(date);
  };
  return {
    shop: {
      name: shop.name ?? '',
      address: shop.address ?? '',
      phone: shop.phone ?? '',
      vatNumber: shop.vatNumber ?? '',
    },
    order: {
      number: order.orderNo,
      at: when(order.placedAt ?? order.createdAt),
      cashier: order.cashierName ?? '',
      branch: order.branchName ?? '',
      note: order.note ?? '',
    },
    customer: {
      name: order.customer?.name ?? '',
      phone: order.customer?.phone ?? '',
    },
    totals: {
      subtotal: money(order.totals?.subtotal),
      discount: money(order.totals?.discountTotal),
      net: money(order.totals?.net),
      vat: money(order.totals?.vat),
      total: money(order.totals?.total),
      change: money(order.changeGiven),
      itemCount: String(order.totals?.itemCount ?? 0),
    },
    /** Rendered by the `items` instruction, which repeats its own little template per line. */
    items: (order.items ?? []).map((item) => ({
      name: item.name,
      sku: item.sku ?? '',
      qty: String(item.qty),
      unitPrice: money(item.unitPrice),
      discount: money(item.discountTotal),
      lineTotal: money(item.lineTotal),
    })),
    payments: (order.payments ?? []).map((payment) => ({
      label: payment.label ?? payment.method,
      amount: money(payment.amount),
    })),
    /** Set by the caller for a tax invoice (P6.4 fills it with the ZATCA TLV). */
    qr: order.zatcaQr ?? '',
    /** The same figures unformatted, for `showIf`: a zero discount prints no discount line. */
    raw: {
      discount: order.totals?.discountTotal ?? 0,
      vat: order.totals?.vat ?? 0,
      change: order.changeGiven ?? 0,
      note: order.note ?? '',
      customer: order.customer?.customerId ? order.customer?.name : '',
    },
  };
}

/**
 * Template instructions → ESC/POS instructions, with the repeating parts expanded.
 * `{ type: 'items', line: {...}, sub?: {...} }` repeats per basket line;
 * `{ type: 'payments', line: {...} }` repeats per tender.
 *
 * A block may carry `showIf: 'raw.discount'` — it is left out when that field is empty or zero,
 * which is how a receipt avoids printing "Discount 0.00" on every sale.
 */
export function expand(template, data) {
  const out = [];
  for (const block of template ?? []) {
    if (block.showIf && !readPath(data, block.showIf)) continue;
    if (block.type === 'items') {
      for (const item of data.items ?? []) {
        out.push(
          fillBlock(block.line ?? { type: 'row', left: '{{name}}', right: '{{lineTotal}}' }, item),
        );
        if (block.sub) out.push(fillBlock(block.sub, item));
      }
    } else if (block.type === 'payments') {
      for (const payment of data.payments ?? [])
        out.push(
          fillBlock(block.line ?? { type: 'row', left: '{{label}}', right: '{{amount}}' }, payment),
        );
    } else {
      out.push(fillBlock(block, data));
    }
  }
  // A block whose text came out empty prints nothing rather than a blank line or a stray label.
  return out.filter((block) => {
    if (block.type === 'text') return block.value.trim() !== '';
    if (block.type === 'row') return String(block.right ?? '').trim() !== '';
    if (block.type === 'qr' || block.type === 'barcode') return String(block.value ?? '') !== '';
    return true;
  });
}

const readPath = (data, path) =>
  String(path)
    .split('.')
    .reduce((at, key) => (at == null ? at : at[key]), data);

const fillBlock = (block, data) => ({
  ...block,
  ...(block.value !== undefined && { value: fill(block.value, data) }),
  ...(block.left !== undefined && { left: fill(block.left, data) }),
  ...(block.right !== undefined && { right: fill(block.right, data) }),
});

/**
 * Template + sale → bytes for the printer.
 * @param {object[]} template
 * @param {object} data  from `receiptData`
 * @param {{ widthMm?: number }} [opts]
 */
export const renderTemplate = (template, data, { widthMm = 80 } = {}) =>
  renderEscPos(expand(template, data), { width: charsForWidth(widthMm) });

/** What a shop starts with: a plain, complete receipt it can then reword (P6.4). */
export const DEFAULT_RECEIPT_TEMPLATE = Object.freeze([
  { type: 'text', value: '{{shop.name}}', align: 'center', bold: true, double: true },
  { type: 'text', value: '{{shop.address}}', align: 'center' },
  { type: 'text', value: '{{shop.phone}}', align: 'center' },
  { type: 'text', value: 'VAT {{shop.vatNumber}}', align: 'center', showIf: 'shop.vatNumber' },
  { type: 'feed', lines: 1 },
  { type: 'row', left: 'Receipt', right: '{{order.number}}' },
  { type: 'row', left: 'Date', right: '{{order.at}}' },
  { type: 'row', left: 'Served by', right: '{{order.cashier}}' },
  { type: 'line' },
  {
    type: 'items',
    line: { type: 'row', left: '{{qty}} x {{name}}', right: '{{lineTotal}}' },
    sub: { type: 'text', value: '   {{sku}} @ {{unitPrice}}' },
  },
  { type: 'line' },
  { type: 'row', left: 'Subtotal', right: '{{totals.subtotal}}' },
  { type: 'row', left: 'Discount', right: '-{{totals.discount}}', showIf: 'raw.discount' },
  { type: 'row', left: 'VAT', right: '{{totals.vat}}' },
  { type: 'row', left: 'Total', right: '{{totals.total}}', bold: true },
  { type: 'payments', line: { type: 'row', left: '{{label}}', right: '{{amount}}' } },
  { type: 'row', left: 'Change', right: '{{totals.change}}', showIf: 'raw.change' },
  { type: 'row', left: 'Customer', right: '{{customer.name}}', showIf: 'raw.customer' },
  { type: 'feed', lines: 1 },
  { type: 'qr', value: '{{qr}}' },
  { type: 'text', value: 'Thank you', align: 'center' },
  { type: 'feed', lines: 2 },
  { type: 'cut' },
]);

/** A shelf label: name, price, and the barcode that rings it up. */
export const DEFAULT_LABEL_TEMPLATE = Object.freeze([
  { type: 'text', value: '{{name}}', align: 'center', bold: true },
  { type: 'text', value: '{{price}}', align: 'center', double: true },
  { type: 'barcode', value: '{{barcode}}' },
  { type: 'feed', lines: 1 },
  { type: 'cut' },
]);
