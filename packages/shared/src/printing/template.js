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
  { shop = {}, currency = 'SAR', lang = 'en', timeZone = 'Asia/Riyadh', storefrontUrl = '' } = {},
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
  const baseUrl = (order.onlineReceiptUrl || storefrontUrl || shop.website || '').replace(
    /\/+$/,
    '',
  );
  const onlineReceiptUrl =
    order.onlineReceiptUrl ||
    (baseUrl && order.orderNo ? `${baseUrl}/${lang}/receipt/${order.orderNo}` : '');

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
      onlineReceiptUrl,
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
      label: payment.reference
        ? `${payment.label ?? payment.method} (${payment.reference})`
        : (payment.label ?? payment.method),
      amount: money(payment.amount),
    })),
    /** Set by the caller for a tax invoice (P6.4 fills it with the ZATCA TLV). */
    qr: order.zatcaQr ?? '',
    onlineReceiptUrl,
    /** The same figures unformatted, for `showIf`: a zero discount prints no discount line. */
    raw: {
      discount: order.totals?.discountTotal ?? 0,
      vat: order.totals?.vat ?? 0,
      change: order.changeGiven ?? 0,
      note: order.note ?? '',
      customer: order.customer?.customerId ? order.customer?.name : '',
      onlineReceiptUrl,
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
  { type: 'text', value: 'SIMPLIFIED TAX INVOICE', align: 'center', bold: true },
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
  { type: 'feed', lines: 1, showIf: 'raw.onlineReceiptUrl' },
  {
    type: 'text',
    value: 'Scan to verify & view receipt online:',
    align: 'center',
    showIf: 'raw.onlineReceiptUrl',
  },
  { type: 'qr', value: '{{order.onlineReceiptUrl}}', showIf: 'raw.onlineReceiptUrl' },
  {
    type: 'text',
    value: '{{order.onlineReceiptUrl}}',
    align: 'center',
    showIf: 'raw.onlineReceiptUrl',
  },
  { type: 'feed', lines: 1, showIf: 'raw.onlineReceiptUrl' },
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

// ---------------------------------------------------------------- configurable templates (P6.4)

export const RECEIPT_LANGUAGES = Object.freeze(['en', 'ar', 'bilingual']);

/**
 * Editable receipt configuration (P6.4). All source strings are English; `ar` is filled by the
 * translation pipeline (`localized()` plugin) or manual override, never hand-written in code.
 */
export const DEFAULT_RECEIPT_CONFIG = Object.freeze({
  lang: 'en',
  widthMm: 80,
  logoMediaId: null,
  headerText: Object.freeze({ en: '' }),
  footerText: Object.freeze({ en: 'Thank you' }),
  fields: Object.freeze({
    showAddress: true,
    showPhone: true,
    showVatNumber: true,
    showBranch: false,
    showCashier: true,
    showCustomer: true,
    showSku: true,
    showVatBreakdown: true,
    showQr: true,
    showOnlineReceipt: true,
  }),
  labels: Object.freeze({
    receipt: Object.freeze({ en: 'Receipt' }),
    date: Object.freeze({ en: 'Date' }),
    branch: Object.freeze({ en: 'Branch' }),
    cashier: Object.freeze({ en: 'Served by' }),
    subtotal: Object.freeze({ en: 'Subtotal' }),
    discount: Object.freeze({ en: 'Discount' }),
    vat: Object.freeze({ en: 'VAT' }),
    total: Object.freeze({ en: 'Total' }),
    change: Object.freeze({ en: 'Change' }),
    customer: Object.freeze({ en: 'Customer' }),
    taxInvoice: Object.freeze({ en: 'SIMPLIFIED TAX INVOICE' }),
    scanOnline: Object.freeze({ en: 'Scan to verify & view receipt online:' }),
  }),
});

export const DEFAULT_LABEL_CONFIG = Object.freeze({
  widthMm: 58,
  heightMm: 30,
  barcodeHeight: 64,
  fields: Object.freeze({
    showShopName: false,
    showName: true,
    showVariant: true,
    showPrice: true,
    showSku: false,
    showBarcodeText: true,
  }),
});

function pickPair(val, fallbackEn = '') {
  if (typeof val === 'string') return { en: val, ar: '' };
  const en = typeof val?.en === 'string' ? val.en : fallbackEn;
  const ar = typeof val?.ar === 'string' ? val.ar.trim() : '';
  return { en, ar };
}

/** Resolves a row label (`Receipt`, `Total`…) for `en`, `ar`, or `bilingual` (`en / ar`). */
export function resolveReceiptLabel(val, fallbackEn, lang = 'en') {
  const { en, ar } = pickPair(val, fallbackEn);
  if (lang === 'ar') return ar || en;
  if (lang === 'bilingual') return ar && ar !== en ? `${en} / ${ar}` : en;
  return en;
}

/** Resolves centered header/footer text into 0, 1, or 2 (bilingual) text blocks. */
function centeredTextBlocks(val, fallbackEn, lang = 'en') {
  const { en, ar } = pickPair(val, fallbackEn);
  if (lang === 'ar') {
    const text = (ar || en).trim();
    return text ? [{ type: 'text', value: text, align: 'center' }] : [];
  }
  if (lang === 'bilingual') {
    const out = [];
    if (en.trim()) out.push({ type: 'text', value: en.trim(), align: 'center' });
    if (ar && ar !== en.trim()) out.push({ type: 'text', value: ar, align: 'center' });
    return out;
  }
  return en.trim() ? [{ type: 'text', value: en.trim(), align: 'center' }] : [];
}

/**
 * Compiles the shop's saved receipt configuration into the instruction list `renderTemplate` uses.
 * With default settings in English, it emits `DEFAULT_RECEIPT_TEMPLATE`.
 *
 * @param {object} [config]
 * @param {{ lang?: 'en' | 'ar' | 'bilingual' }} [opts]
 */
export function buildReceiptTemplate(config = {}, opts = {}) {
  const lang = opts.lang ?? config?.lang ?? DEFAULT_RECEIPT_CONFIG.lang;
  const fields = { ...DEFAULT_RECEIPT_CONFIG.fields, ...config?.fields };
  const labels = { ...DEFAULT_RECEIPT_CONFIG.labels, ...config?.labels };
  const lbl = (key) =>
    resolveReceiptLabel(labels[key], DEFAULT_RECEIPT_CONFIG.labels[key].en, lang);

  const blocks = [
    { type: 'text', value: '{{shop.name}}', align: 'center', bold: true, double: true },
    { type: 'text', value: lbl('taxInvoice'), align: 'center', bold: true },
  ];
  if (fields.showAddress) blocks.push({ type: 'text', value: '{{shop.address}}', align: 'center' });
  if (fields.showPhone) blocks.push({ type: 'text', value: '{{shop.phone}}', align: 'center' });
  if (fields.showVatNumber) {
    blocks.push({
      type: 'text',
      value: `${lbl('vat')} {{shop.vatNumber}}`,
      align: 'center',
      showIf: 'shop.vatNumber',
    });
  }
  blocks.push(...centeredTextBlocks(config?.headerText, '', lang));
  blocks.push({ type: 'feed', lines: 1 });
  blocks.push({ type: 'row', left: lbl('receipt'), right: '{{order.number}}' });
  blocks.push({ type: 'row', left: lbl('date'), right: '{{order.at}}' });
  if (fields.showBranch) {
    blocks.push({
      type: 'row',
      left: lbl('branch'),
      right: '{{order.branch}}',
      showIf: 'order.branch',
    });
  }
  if (fields.showCashier) {
    blocks.push({ type: 'row', left: lbl('cashier'), right: '{{order.cashier}}' });
  }
  blocks.push({ type: 'line' });
  blocks.push({
    type: 'items',
    line: { type: 'row', left: '{{qty}} x {{name}}', right: '{{lineTotal}}' },
    ...(fields.showSku ? { sub: { type: 'text', value: '   {{sku}} @ {{unitPrice}}' } } : {}),
  });
  blocks.push({ type: 'line' });
  blocks.push({ type: 'row', left: lbl('subtotal'), right: '{{totals.subtotal}}' });
  blocks.push({
    type: 'row',
    left: lbl('discount'),
    right: '-{{totals.discount}}',
    showIf: 'raw.discount',
  });
  if (fields.showVatBreakdown) {
    blocks.push({ type: 'row', left: lbl('vat'), right: '{{totals.vat}}' });
  }
  blocks.push({ type: 'row', left: lbl('total'), right: '{{totals.total}}', bold: true });
  blocks.push({ type: 'payments', line: { type: 'row', left: '{{label}}', right: '{{amount}}' } });
  blocks.push({
    type: 'row',
    left: lbl('change'),
    right: '{{totals.change}}',
    showIf: 'raw.change',
  });
  if (fields.showCustomer) {
    blocks.push({
      type: 'row',
      left: lbl('customer'),
      right: '{{customer.name}}',
      showIf: 'raw.customer',
    });
  }
  blocks.push({ type: 'feed', lines: 1 });
  if (fields.showQr) blocks.push({ type: 'qr', value: '{{qr}}' });
  if (fields.showOnlineReceipt) {
    blocks.push(
      { type: 'feed', lines: 1, showIf: 'raw.onlineReceiptUrl' },
      {
        type: 'text',
        value: lbl('scanOnline'),
        align: 'center',
        showIf: 'raw.onlineReceiptUrl',
      },
      { type: 'qr', value: '{{order.onlineReceiptUrl}}', showIf: 'raw.onlineReceiptUrl' },
      {
        type: 'text',
        value: '{{order.onlineReceiptUrl}}',
        align: 'center',
        showIf: 'raw.onlineReceiptUrl',
      },
      { type: 'feed', lines: 1, showIf: 'raw.onlineReceiptUrl' },
    );
  }
  blocks.push(
    ...centeredTextBlocks(
      config?.footerText ?? DEFAULT_RECEIPT_CONFIG.footerText,
      DEFAULT_RECEIPT_CONFIG.footerText.en,
      lang,
    ),
  );
  blocks.push({ type: 'feed', lines: 2 });
  blocks.push({ type: 'cut' });
  return blocks;
}

/**
 * Compiles a barcode label configuration into ESC/POS instructions.
 * @param {object} [config]
 */
export function buildLabelTemplate(config = {}) {
  const fields = { ...DEFAULT_LABEL_CONFIG.fields, ...config?.fields };
  const barcodeHeight = config?.barcodeHeight ?? DEFAULT_LABEL_CONFIG.barcodeHeight;
  const blocks = [];
  if (fields.showShopName) {
    blocks.push({ type: 'text', value: '{{shopName}}', align: 'center' });
  }
  if (fields.showName) {
    blocks.push({ type: 'text', value: '{{name}}', align: 'center', bold: true });
  }
  if (fields.showVariant) {
    blocks.push({ type: 'text', value: '{{variant}}', align: 'center' });
  }
  if (fields.showPrice) {
    blocks.push({ type: 'text', value: '{{price}}', align: 'center', double: true });
  }
  blocks.push({
    type: 'barcode',
    value: '{{barcode}}',
    height: barcodeHeight,
    hri: Boolean(fields.showBarcodeText),
  });
  if (fields.showSku) {
    blocks.push({ type: 'text', value: 'SKU: {{sku}}', align: 'center' });
  }
  blocks.push({ type: 'feed', lines: 1 });
  blocks.push({ type: 'cut' });
  return blocks;
}

/**
 * Formats a product variant for `buildLabelTemplate`.
 * @param {{ name?: string, variant?: string, sku?: string, barcode?: string, price?: number }} item
 * @param {{ shop?: { name?: string }, currency?: string, lang?: string }} [ctx]
 */
export function labelData(item = {}, { shop = {}, currency = 'SAR', lang = 'en' } = {}) {
  return {
    shopName: shop.name ?? '',
    name: item.name ?? '',
    variant: item.variant ?? '',
    sku: item.sku ?? '',
    barcode: item.barcode || item.sku || '',
    price:
      typeof item.price === 'string'
        ? item.price
        : formatMoney(item.price ?? 0, { currency, lang }),
  };
}
