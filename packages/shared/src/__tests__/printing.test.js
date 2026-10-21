import { describe, expect, it } from 'vitest';
import {
  buildLabelTemplate,
  buildReceiptTemplate,
  charsForWidth,
  columns,
  createPrintingSchemas,
  decodeZatcaQr,
  DEFAULT_LABEL_TEMPLATE,
  DEFAULT_RECEIPT_TEMPLATE,
  encodeText,
  expand,
  fill,
  labelData,
  previewLines,
  qrMatrix,
  qrSvg,
  receiptData,
  renderEscPos,
  renderTemplate,
  toBase64,
  wrap,
  zatcaQr,
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
    // `GS V 66 n` feeds n dots and cuts in one command — no separate feed to waste paper.
    const cut = [...renderEscPos([{ type: 'cut' }])];
    expect(cut.slice(-4)).toEqual([0x1d, 0x56, 66, 12]);
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

  it('gives a double-width row half the characters, so it still fits the paper', () => {
    const [line] = (() => {
      const bytes = renderEscPos([{ type: 'row', left: 'Total', right: '345.00', double: true }], {
        width: 32,
      });
      return previewLines(bytes);
    })();
    expect(line).toHaveLength(16);
    expect(line.endsWith('345.00')).toBe(true);
  });

  it('prints a QR big enough and robust enough to scan off thermal paper', () => {
    const bytes = [...renderEscPos([{ type: 'qr', value: 'AQ==' }])];
    // GS ( k … 1C n — the module size, in dots.
    const sizeAt = bytes.findIndex(
      (b, i) => b === 0x1d && bytes[i + 5] === 0x31 && bytes[i + 6] === 0x43,
    );
    expect(bytes[sizeAt + 7]).toBeGreaterThanOrEqual(8);
    // GS ( k … 1E n — error correction. 48 is level L, which is what `qrMatrix` measures: ask the
    // printer for a heavier level than we size for and it squeezes a bigger code into the room.
    const eccAt = bytes.findIndex(
      (b, i) => b === 0x1d && bytes[i + 5] === 0x31 && bytes[i + 6] === 0x45,
    );
    expect(bytes[eccAt + 7]).toBe(48);
  });

  it('prints the QR as large as the paper allows, and never off the edge', () => {
    const value = zatcaQr({
      sellerName: 'Al Noor Market',
      vatNumber: '300000000000003',
      timestamp: '2026-10-14T14:30:00.000Z',
      total: 21_500,
      vat: 2804,
    });
    const modules = qrMatrix(value).length;
    const moduleSize = (width) => {
      const bytes = [...renderEscPos([{ type: 'qr', value }], { width })];
      const at = bytes.findIndex(
        (b, i) => b === 0x1d && bytes[i + 5] === 0x31 && bytes[i + 6] === 0x43,
      );
      return bytes[at + 7];
    };
    const mm = (dots) => (dots / 203) * 25.4;
    for (const width of [32, 42, 48]) {
      // 12 dots per character is what a 203 dpi head prints; the code must stay inside it.
      expect(modules * moduleSize(width)).toBeLessThan(width * 12);
    }
    // 58 mm paper (32 characters) is the narrowest a shop may set, and the one a cashier scans
    // from most: the ZATCA code has to come out at least 45 mm across there.
    expect(mm(modules * moduleSize(32))).toBeGreaterThanOrEqual(45);
    // Wider paper is spent on a bigger code, not on margins.
    expect(moduleSize(48)).toBeGreaterThan(moduleSize(32));
    expect(modules * moduleSize(32)).toBeGreaterThan(32 * 12 * 0.8);
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
        ['  2 x SAR 115.00', 'SAR 220.00'],
        ['  1 x SAR 34.50', 'SAR 34.50'],
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

  it('reads as a receipt a customer can check: name, then quantity at a price', () => {
    const lines = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 58 }));
    const shirt = lines.indexOf('Oxford Shirt');
    expect(shirt).toBeGreaterThan(-1);
    expect(lines[shirt + 1]).toMatch(/^2 x SAR 115\.00\s+SAR 220\.00$/);
    // A till receipt is for the customer: the shop's own codes stay off it.
    expect(lines.some((l) => l.includes('OX-RED'))).toBe(false);
  });

  it('says it is a simplified tax invoice once the shop has a VAT number', () => {
    expect(textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 80 }))).toContain(
      'SIMPLIFIED TAX INVOICE',
    );
    const noVat = receiptData(SALE, { shop: { ...SHOP, vatNumber: '' } });
    expect(textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, noVat, { widthMm: 80 }))).not.toContain(
      'SIMPLIFIED TAX INVOICE',
    );
  });

  it('names the cashier and the customer when the sale knows them', () => {
    const lines = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, data, { widthMm: 80 }));
    expect(lines.some((l) => l.startsWith('Served by') && l.includes('Cassy'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Customer') && l.includes('Walk-in'))).toBe(false);
    const named = receiptData({ ...SALE, customer: { name: 'Nora Said' } }, { shop: SHOP });
    expect(
      textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, named, { widthMm: 80 })).some((l) =>
        l.includes('Nora Said'),
      ),
    ).toBe(true);
  });

  it('wastes no paper after the cut, which feeds clear of the blade itself', () => {
    // The only feeds left are the line of air either side of a QR.
    expect(DEFAULT_RECEIPT_TEMPLATE.filter((b) => b.type === 'feed').map((b) => b.lines)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(DEFAULT_RECEIPT_TEMPLATE.at(-1)).toEqual({ type: 'cut' });
    expect(DEFAULT_LABEL_TEMPLATE.filter((b) => b.type === 'feed')).toEqual([]);
    // What the printer is told at the end: cut, feeding only the dots that clear the blade.
    expect([...renderEscPos([{ type: 'cut' }])].slice(-4)).toEqual([0x1d, 0x56, 66, 12]);
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

  it('generates dynamic online receipt QR code when storefrontUrl or onlineReceiptUrl is present', () => {
    const online = receiptData(SALE, {
      shop: SHOP,
      storefrontUrl: 'https://supershop.com',
    });
    expect(online.order.onlineReceiptUrl).toBe('https://supershop.com/en/receipt/POS-000001');
    const expanded = expand(DEFAULT_RECEIPT_TEMPLATE, online);
    const qrBlocks = expanded.filter((b) => b.type === 'qr');
    expect(qrBlocks.some((b) => b.value === 'https://supershop.com/en/receipt/POS-000001')).toBe(
      true,
    );
    const lines = textOf(renderTemplate(DEFAULT_RECEIPT_TEMPLATE, online, { widthMm: 80 }));
    expect(lines.some((l) => l.includes('Scan for your e-receipt'))).toBe(true);
    // The QR carries the link; printing it as text as well only fills the paper.
    expect(lines).not.toContain('https://supershop.com/en/receipt/POS-000001');
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

  it('validates receipt and barcode label template edits', () => {
    expect(
      schemas.receiptTemplate.safeParse({
        lang: 'bilingual',
        widthMm: 80,
        fields: { showBranch: true, showCashier: false },
        footerText: 'See you soon',
      }).success,
    ).toBe(true);
    expect(schemas.receiptTemplate.safeParse({ lang: 'fr' }).success).toBe(false);
    expect(
      schemas.labelTemplate.safeParse({
        widthMm: 50,
        heightMm: 30,
        barcodeHeight: 72,
        fields: { showShopName: true, showSku: true },
      }).success,
    ).toBe(true);
    expect(schemas.labelTemplate.safeParse({ widthMm: 5 }).success).toBe(false);
  });
});

describe('ZATCA simplified tax invoice QR (P6.4)', () => {
  it('encodes all 5 TLV fields in Base64 and decodes them back', () => {
    const qr = zatcaQr({
      sellerName: 'Supershop',
      vatNumber: '300000000000003',
      timestamp: '2026-10-14T20:00:00.000Z',
      total: 25_450,
      vat: 3320,
    });
    expect(qr).toBeTruthy();
    expect(decodeZatcaQr(qr)).toEqual({
      sellerName: 'Supershop',
      vatNumber: '300000000000003',
      timestamp: '2026-10-14T20:00:00.000Z',
      total: '254.50',
      vat: '33.20',
    });
    const svg = qrSvg(qr);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path d="M');
  });

  it('returns empty string when the shop has no VAT number', () => {
    expect(
      zatcaQr({
        sellerName: 'Supershop',
        vatNumber: null,
        timestamp: '2026-10-14T20:00:00.000Z',
        total: 11_500,
        vat: 1500,
      }),
    ).toBe('');
    expect(qrSvg('')).toBe('');
  });
});

describe('configurable receipt and label templates (P6.4)', () => {
  const sampleAr = '\u0641\u0627\u062a\u0648\u0631\u0629';

  it('builds the default receipt when given no overrides', () => {
    expect(buildReceiptTemplate()).toEqual(DEFAULT_RECEIPT_TEMPLATE);
  });

  it('toggles fields and formats bilingual or Arabic labels cleanly', () => {
    const tpl = buildReceiptTemplate({
      lang: 'bilingual',
      headerText: { en: 'Welcome', ar: sampleAr },
      footerText: { en: 'Thank you', ar: sampleAr },
      fields: { showCashier: false, showBranch: true, showSku: false },
      labels: { total: { en: 'Total', ar: sampleAr } },
    });
    const data = receiptData({ ...SALE, branchName: 'Main' }, { shop: SHOP });
    const lines = textOf(renderTemplate(tpl, data, { widthMm: 80 }));
    expect(lines).toContain('Welcome');
    expect(lines).toContain(sampleAr);
    expect(lines.some((l) => l.includes('Branch'))).toBe(true);
    expect(lines.some((l) => l.includes('Served by'))).toBe(false);
    expect(lines.some((l) => l.includes('OX-RED'))).toBe(false);
    expect(lines.some((l) => l.includes(`Total / ${sampleAr}`))).toBe(true);
  });

  it('builds a configurable barcode label', () => {
    const tpl = buildLabelTemplate({
      barcodeHeight: 70,
      fields: { showShopName: true, showVariant: true, showSku: true, showBarcodeText: false },
    });
    const data = labelData(
      {
        name: 'Oxford Shirt',
        variant: 'Red / L',
        sku: 'OX-RED',
        barcode: '6281000000017',
        price: 11_500,
      },
      { shop: SHOP },
    );
    const lines = textOf(renderTemplate(tpl, data, { widthMm: 58 }));
    expect(lines).toEqual(
      expect.arrayContaining(['Supershop', 'Oxford Shirt', 'Red / L', 'SAR 115.00', 'SKU: OX-RED']),
    );
  });
});
