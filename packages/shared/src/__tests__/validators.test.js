import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as v from '../validators/index.js';

const { V } = v;
const ok = (schema, input) => {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new Error(`expected success for ${JSON.stringify(input)}: ${r.error.issues[0].message}`);
  return r.data;
};
const msg = (schema, input) => {
  const r = schema.safeParse(input);
  expect(r.success, `expected failure for ${JSON.stringify(input)}`).toBe(false);
  return r.error.issues[0].message;
};

describe('name', () => {
  it.each([
    ['  John   Smith ', 'John Smith'],
    ["O'Neil-Smith Jr.", "O'Neil-Smith Jr."],
    ['محمد عبدالله', 'محمد عبدالله'],
    ['مُحَمَّد', 'مُحَمَّد'], // Arabic diacritics
    ['José Álvarez', 'José Álvarez'],
  ])('accepts %j', (input, expected) => expect(ok(v.name, input)).toBe(expected));

  it.each([
    ['John3'],
    ['محمد٣'],
    ['A'],
    ['<b>x</b>'],
    ['john@doe'],
    ['--'],
    ['x'.repeat(61)],
    ['Иван'],
  ])('rejects %j', (input) => expect(msg(v.name, input)).toMatch(/^validation\./));

  it('uses i18n keys, never English, for type errors', () => {
    expect(msg(v.name, 42)).toBe(V.INVALID_TYPE);
  });
});

describe('email', () => {
  it('trims and lower-cases', () =>
    expect(ok(v.email, '  John.Doe@Example.COM ')).toBe('john.doe@example.com'));
  it.each([['no-at'], ['a@b'], ['a b@c.com'], [`${'a'.repeat(250)}@x.com`]])(
    'rejects %j',
    (input) => expect(msg(v.email, input)).toMatch(/^validation\./),
  );
});

describe('phone (KSA)', () => {
  const ksa = v.phone();
  it.each([
    ['0512345678'],
    ['512345678'],
    ['+966512345678'],
    ['966512345678'],
    ['00966512345678'],
    ['050 123 4567'.replace('050', '051')],
    ['(051) 234-5678'],
    ['٠٥١٢٣٤٥٦٧٨'], // Arabic-Indic digits
  ])('normalizes %j', (input) => expect(ok(ksa, input)).toMatch(/^\+9665\d{8}$/));

  it('produces the exact normalized number', () => {
    expect(ok(ksa, '0512345678')).toBe('+966512345678');
  });

  it.each([
    ['0412345678'],
    ['05123456789'],
    ['05123x5678'],
    ['+44 20 7946 0958'],
    ['05.1234567e'],
    [''],
  ])('rejects %j', (input) => expect(msg(ksa, input)).toBe(V.PHONE_KSA_ONLY));

  it('allows international numbers when configured', () => {
    const intl = v.phone({ allowInternational: true });
    expect(ok(intl, '+44 20 7946 0958')).toBe('+442079460958');
    expect(ok(intl, '0044 20 7946 0958')).toBe('+442079460958');
    expect(ok(intl, '0512345678')).toBe('+966512345678');
    expect(msg(intl, '+9661234')).toBe(V.PHONE_INVALID); // bad +966 number is not "international"
  });
});

describe('money', () => {
  it('moneyMinor: integer minor units only', () => {
    expect(ok(v.moneyMinor(), 1999)).toBe(1999);
    expect(msg(v.moneyMinor(), 19.99)).toBe(V.MONEY_INVALID);
    expect(msg(v.moneyMinor(), -1)).toBe(V.MONEY_NEGATIVE);
    expect(msg(v.moneyMinor({ allowZero: false }), 0)).toBe(V.MONEY_ZERO);
    expect(msg(v.moneyMinor({ max: 100 }), 101)).toBe(V.MONEY_TOO_LARGE);
    expect(msg(v.moneyMinor(), '100')).toBe(V.MONEY_INVALID);
  });

  it('moneyInput: decimal UI input → minor units', () => {
    const s = v.moneyInput();
    expect(ok(s, '19.99')).toBe(1999);
    expect(ok(s, '١٩٫٩٩')).toBe(1999);
    expect(ok(s, 5)).toBe(500);
    expect(msg(s, '1.999')).toBe(V.MONEY_TOO_MANY_DECIMALS);
    expect(msg(s, '1,000')).toBe(V.MONEY_INVALID);
    expect(msg(s, '-5')).toBe(V.MONEY_NEGATIVE);
    expect(msg(v.moneyInput({ allowZero: false }), '0.00')).toBe(V.MONEY_ZERO);
  });
});

describe('quantity', () => {
  const q = v.quantity({ max: 50 });
  it('accepts integers and digit strings (incl. Arabic)', () => {
    expect(ok(q, 3)).toBe(3);
    expect(ok(q, '12')).toBe(12);
    expect(ok(q, '٧')).toBe(7);
  });
  it.each([[0], [-1], [1.5], ['1.5'], ['abc'], [''], [null]])('rejects %j', (input) =>
    expect(msg(q, input)).toBe(V.QTY_INVALID),
  );
  it('enforces the configured max', () => expect(msg(q, 51)).toBe(V.QTY_TOO_LARGE));
});

describe('address / plainText', () => {
  it('collapses whitespace and rejects HTML/control chars', () => {
    expect(ok(v.address, '  King Fahd Rd,   Riyadh 12345 ')).toBe('King Fahd Rd, Riyadh 12345');
    expect(ok(v.address, 'طريق الملك فهد، الرياض')).toBe('طريق الملك فهد، الرياض');
    expect(msg(v.address, '<script>alert(1)</script>')).toBe(V.ADDRESS_INVALID);
    expect(msg(v.address, 'ab')).toBe(V.TOO_SHORT);
    expect(msg(v.plainText({ max: 5 }), 'abcdef')).toBe(V.TOO_LONG);
    expect(msg(v.plainText(), 'a\u0000b')).toBe(V.ADDRESS_INVALID);
    expect(ok(v.plainText(), 'line1\nline2')).toBe('line1\nline2');
  });
});

describe('password', () => {
  it('default policy: ≥10 chars, lower + digit', () => {
    expect(ok(v.password(), 'correcthorse9')).toBe('correcthorse9');
    expect(msg(v.password(), 'short1')).toBe(V.PASSWORD_TOO_SHORT);
    expect(msg(v.password(), 'nodigitshere')).toBe(V.PASSWORD_NEEDS_DIGIT);
    expect(msg(v.password(), 'x'.repeat(129) + '1')).toBe(V.PASSWORD_TOO_LONG);
  });
  it('configurable policy', () => {
    const strict = v.password({ minLength: 8, requireUpper: true, requireSymbol: true });
    const r = strict.safeParse('lowercase1');
    expect(r.error.issues.map((i) => i.message).sort()).toEqual(
      [V.PASSWORD_NEEDS_SYMBOL, V.PASSWORD_NEEDS_UPPER].sort(),
    );
    expect(ok(strict, 'Lower-case1')).toBe('Lower-case1');
  });
});

describe('codes, slugs, ids, urls', () => {
  it('sku / barcode', () => {
    expect(ok(v.sku, ' tsh-blk_m.01 ')).toBe('TSH-BLK_M.01');
    expect(msg(v.sku, 'A B')).toBe(V.CODE_INVALID);
    expect(msg(v.sku, 'A/B')).toBe(V.CODE_INVALID);
    expect(ok(v.barcode, '٦٢٨١٠٠٠٠٠٠٠٠٧')).toBe('6281000000007'); // Arabic digits, valid EAN-13
    expect(msg(v.barcode, '6281000000000')).toBe(V.BARCODE_CHECKSUM);
    expect(ok(v.barcode, '1234567890')).toBe('1234567890'); // not a GTIN length → Code 128
    expect(ok(v.barcode, 'abc-123')).toBe('ABC-123');
    expect(msg(v.barcode, '123')).toBe(V.TOO_SHORT);
  });

  it('slug + toSlug', () => {
    expect(ok(v.slug, 'Mens-Shirts')).toBe('mens-shirts');
    expect(msg(v.slug, 'a--b')).toBe(V.SLUG_INVALID);
    expect(msg(v.slug, '-a')).toBe(V.SLUG_INVALID);
    expect(v.toSlug("Men's T-Shirts & Polos")).toBe('mens-t-shirts-polos');
    expect(v.toSlug('Café Crème')).toBe('cafe-creme');
    expect(v.toSlug('قمصان')).toBe('');
  });

  it('objectId / httpUrl', () => {
    expect(ok(v.objectId, '507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    expect(msg(v.objectId, '{"$gt":""}')).toBe(V.ID_INVALID);
    expect(ok(v.httpUrl, 'https://example.com/a')).toBe('https://example.com/a');
    expect(msg(v.httpUrl, 'javascript:alert(1)')).toBe(V.URL_INVALID);
  });
});

describe('paginationQuery', () => {
  const q = v.paginationQuery({ sortable: ['createdAt', 'price'] });

  it('applies defaults', () => {
    expect(ok(q, {})).toEqual({ page: 1, limit: 20, sort: { field: 'createdAt', direction: -1 } });
  });

  it('parses query-string values', () => {
    expect(ok(q, { page: '3', limit: '50', sort: 'price' })).toEqual({
      page: 3,
      limit: 50,
      sort: { field: 'price', direction: 1 },
    });
  });

  it('whitelists sort fields and bounds limit', () => {
    expect(msg(q, { sort: 'passwordHash' })).toBe(V.SORT_INVALID);
    expect(q.safeParse({ limit: '1000' }).success).toBe(false);
    expect(q.safeParse({ page: '0' }).success).toBe(false);
  });

  it('composes with z.object for endpoint schemas', () => {
    const listProducts = q.extend({ q: v.plainText({ max: 100 }).optional() });
    expect(ok(listProducts, { q: ' shirt ' }).q).toBe('shirt');
  });
});

describe('sanitizers (keystroke filters)', () => {
  it('drop characters that can never be valid', () => {
    expect(v.sanitizeName('Jo3hn$ محمد٣')).toBe('John محمد');
    expect(v.sanitizePhone('+966 (05) ١٢٣-abc+')).toBe('+96605123');
    expect(v.sanitizeMoney('١٢.٣٤٥x.6')).toBe('12.34');
    expect(v.sanitizeInteger('1a٢')).toBe('12');
    expect(v.sanitizeCode('ab c/1')).toBe('ABC1');
    expect(v.sanitizeEmail(' A@B.com ')).toBe('a@b.com');
    expect(v.sanitizeSlug('Hello--World!')).toBe('hello-world');
    expect(v.sanitizePlainText('a<b>\u0007c\n')).toBe('abc\n');
  });

  it('sanitized output passes the matching schema for typical input', () => {
    expect(z.string().pipe(v.phone()).safeParse(v.sanitizePhone('٠٥١-٢٣٤-٥٦٧٨')).success).toBe(
      true,
    );
  });
});
