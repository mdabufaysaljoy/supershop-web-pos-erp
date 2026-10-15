import { describe, expect, it } from 'vitest';
import {
  charsForWidth,
  columns,
  createPrintingSchemas,
  DEFAULT_LABEL_TEMPLATE,
  DEFAULT_RECEIPT_TEMPLATE,
  encodeText,
  expand,
  fill,
  receiptData,
  previewLines,
  renderEscPos,
  renderTemplate,
  toBase64,
  wrap,
} from '../index.js';

/** P6.3 — what comes out of a receipt printer, decided here so it can be read without paper. */
const SALE = {
  orderNo: 'POS-000001',
  placedAt: '2026-10-14 20:00',
  cashierName: 'Cassy',
  totals: {
    itemCount: 3,
    subtotal: 26_450,
    discountTotal: 1000,
    net: 22_130,
    vat: 3320,
    total: 25_450,
  },
  items: [
    {
      name: 'Oxford Shirt',
      sku: 'OX-RED',
      qty: 2,
      unitPrice: 11_500,
      discountTotal: 1000,
      lineTotal: 22_000,
    },
    {
      name: 'Basmati Rice',
      sku: 'RICE-5',
      qty: 1,
      unitPrice: 3450,
      discountTotal: 0,
      lineTotal: 3450,
    },
  ],
  payments: [{ label: 'Cash', amount: 30_000 }],
  changeGiven: 4550,
  customer: { name: 'Walk-in customer' },
};
const SHOP = {
  name: 'Supershop',
  address: 'Riyadh',
  phone: '+966500000000',
  vatNumber: '300000000000003',
};

/** `Intl` puts a non-breaking space inside money; assertions read it as an ordinary one. */
const plain = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');
const plainly = (object) =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [key, plain(value)]));

/** The printable lines, read back from the bytes with the shared preview decoder. */
const textOf = (bytes) => previewLines(bytes).map((line) => line.trim());

describe('laying out a line', () => {
  it('puts the amount at the end and cuts the name, never the money', () => {
    expect(columns('Oxford Shirt', '115.00', 32)).toBe('Oxford Shirt              115.00');
    expect(columns('A name far too long for this paper', '115.00', 24)).toHaveLength(24);
    expect(columns('A name far too long for this paper', '115.00', 24).endsWith('115.00')).toBe(
      true,
    );
  });

  it('wraps on spaces, and cuts a word that cannot fit', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrap('Supercalifragilistic', 8)).toEqual(['Supercal', 'ifragili', 'stic']);
  });

  it('knows how many characters each paper width holds', () => {
    expect(charsForWidth(58)).toBe(32);
    expect(charsForWidth(80)).toBe(48);
    expect(charsForWidth(999)).toBe(48); // an unknown width falls back to the common one
  });

  it('replaces what the printer cannot show instead of sending nonsense', () => {
    expect(encodeText('Café')).toEqual([67, 97, 102, 63]);
  });
});

describe('ESC/POS', () => {
  it('starts by forgetting whatever the last receipt left set', () => {
    expect([...renderEscPos([]).slice(0, 2)]).toEqual([0x1b, 0x40]);
  });

  it('writes the lines a receipt is made of', () => {
    const bytes = renderEscPos(
      [
        { type: 'text', value: 'SUPERSHOP', align: 'center', bold: true },
        { type: 'line' },
        { type: 'row', left: 'Shirt', right: '115.00' },
      ],
      { width: 24 },
    );
    expect(textOf(bytes)).toEqual(['SUPERSHOP', '-'.repeat(24), 'Shirt             115.00']);
  });

  it('cuts the paper and kicks the drawer with the right codes', () => {
    const cut = [...renderEscPos([{ type: 'cut' }])];
    expect(cut.slice(-4)).toEqual([0x1d, 0x56, 66, 0]);
    expect([...renderEscPos([{ type: 'drawer' }])].slice(-5)).toEqual([
      0x1b, 0x70, 0x00, 0x19, 0xfa,
    ]);
  });

  it('stores and prints a QR, and a Code 128 barcode', () => {
    const qr = [...renderEscPos([{ type: 'qr', value: 'AQ==' }])];
    expect(qr).toEqual(expect.arrayContaining([0x1d, 0x28, 0x6b])); // GS ( k
    const barcode = [...renderEscPos([{ type: 'barcode', value: '6281000000017' }])];
    expect(barcode).toEqual(expect.arrayContaining([0x1d, 0x6b, 0x49])); // GS k 73 (Code 128)
  });

  it('skips an instruction it does not know rather than guessing', () => {
    expect([...renderEscPos([{ type: 'hologram' }])]).toEqual([0x1b, 0x40]);
  });

  it('hands the bytes over as base64, which is what the printer bridge takes', () => {
    expect(toBase64(Uint8Array.from([0x1b, 0x40]))).toBe('G0A=');
  });
});

describe('a receipt', () => {
  const data = receiptData(SALE, { shop: SHOP });

  it('formats every figure once, from what the order carries', () => {
    expect(plainly(data.totals)).toMatchObject({
      subtotal: 'SAR 264.50',
      discount: 'SAR 10.00',
      vat: 'SAR 33.20',
      total: 'SAR 254.50',
      change: 'SAR 45.50',
    });
    expect(plainly(data.items[0])).toMatchObject({
      qty: '2',
      unitPrice: 'SAR 115.00',
      lineTotal: 'SAR 220.00',
    });
  });

  it('fills fields and leaves unknown ones empty instead of printing braces', () => {
    expect(fill('{{shop.name}} · {{shop.nothing}}', data)).toBe('Supershop · ');
  });

  it('repeats a line per item and per payment', () => {
    const rows = expand(DEFAULT_RECEIPT_TEMPLATE, data).filter((b) => b.type === 'row');
    expect(rows.map((r) => [plain(r.left), plain(r.right)])).toEqual(
      expect.arrayContaining([
        ['2 x Oxford Shirt', 'SAR 220.00'],
        ['1 x Basmati Rice', 'SAR 34.50'],
        ['Cash', 'SAR 300.00'],
        ['Total', 'SAR 254.50'],
        ['Change', 'SAR 45.50'],
      ]),
    );
  });

  it('leaves out what does not apply to this sale', () => {
    const plain = receiptData(
      { ...SALE, totals: { ...SALE.totals, discountTotal: 0 }, changeGiven: 0 },
      { shop: SHOP },
    );
    const labels = expand(DEFAULT_RECEIPT_TEMPLATE, plain)
      .filter((b) => b.type === 'row')
      .map((r) => r.left);
    expect(labels).not.toContain('Discount');
    expect(labels).not.toContain('Change');
    // A walk-in has no account, so the receipt names nobody.
    expect(labels).not.toContain('Customer');
  });

  it('prints no QR until a tax invoice provides one', () => {
    expect(expand(DEFAULT_RECEIPT_TEMPLATE, data).some((b) => b.type === 'qr')).toBe(false);
    const taxed = receiptData({ ...SALE, zatcaQr: 'AQZTdXBlcg==' }, { shop: SHOP });
    expect(expand(DEFAULT_RECEIPT_TEMPLATE, taxed).some((b) => b.type === 'qr')).toBe(true);
  });

  it('fits the paper it is printed on', () => {
    const narrow = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 58 }));
    expect(Math.max(...narrow.map((l) => l.length))).toBeLessThanOrEqual(32);
    const wide = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 80 }));
    expect(wide.some((l) => l.length > 32)).toBe(true);
    expect(Math.max(...wide.map((l) => l.length))).toBeLessThanOrEqual(48);
  });

  it('leaves out the shop’s VAT number until it has one', () => {
    const noVat = receiptData(SALE, { shop: { ...SHOP, vatNumber: '' } });
    expect(textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, noVat, { widthMm: 80 }))).not.toContain(
      'VAT',
    );
    expect(
      textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, receiptData(SALE, { shop: SHOP }))),
    ).toContain(`VAT ${SHOP.vatNumber}`);
  });

  it('shows the shop at the top and the total further down', () => {
    const lines = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 80 }));
    expect(lines[0]).toBe('Supershop');
    expect(lines.some((l) => l.includes('POS-000001'))).toBe(true);
    expect(lines.at(-1)).toBe('Thank you');
  });
});

describe('a label', () => {
  it('carries the name, the price and the barcode that rings it up', () => {
    const bytes = renderTemplate(
      DEFAULT_LABEL_TEMPLATE,
      { name: 'Oxford Shirt', price: 'SAR 115.00', barcode: '6281000000017' },
      { widthMm: 58 },
    );
    expect(textOf(bytes)).toEqual(expect.arrayContaining(['Oxford Shirt', 'SAR 115.00']));
    expect([...bytes]).toEqual(expect.arrayContaining([0x1d, 0x6b, 0x49]));
  });
});

describe('what the admin may send', () => {
  const schemas = createPrintingSchemas();

  it('fills a new profile in with sensible defaults', () => {
    expect(schemas.create.parse({ name: 'Front till', printer: 'EPSON TM-T20' })).toEqual({
      name: 'Front till',
      printer: 'EPSON TM-T20',
      kind: 'receipt',
      widthMm: 80,
      branchId: null,
      cut: true,
      openDrawer: false,
      isDefault: false,
    });
  });

  it('refuses a paper width no thermal printer has', () => {
    expect(schemas.create.safeParse({ name: 'X', printer: 'P', widthMm: 70 }).success).toBe(false);
  });

  it('refuses to sign something that is not a QZ call', () => {
    expect(schemas.sign.safeParse({ data: '' }).success).toBe(false);
    expect(schemas.sign.safeParse({ data: 'x'.repeat(5000) }).success).toBe(false);
    expect(schemas.sign.safeParse({ data: '{"call":"printers.find"}' }).success).toBe(true);
  });
});
