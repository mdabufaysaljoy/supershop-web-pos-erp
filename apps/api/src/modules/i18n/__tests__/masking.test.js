import { describe, expect, it } from 'vitest';
import { mask, MaskMismatchError, rejectReason, unmask } from '../masking.js';

const T = (n) => `⟦${n}⟧`;
// A "translator" that uppercases words but keeps tokens — enough to prove the round trip.
const fakeTranslate = (s) => s.replace(/[a-z]+/g, (w) => w.toUpperCase());

describe('mask', () => {
  it.each([
    ['Hello {name}, you have {{count}} items', ['{name}', '{{count}}']],
    ['Saved %s of %1$d', ['%s', '%1$d']],
    ['<p class="x">Buy <b>now</b></p>', ['<p class="x">', '<b>', '</b>', '</p>']],
    ['Fish &amp; chips', ['&amp;']],
    [
      'Visit https://shop.example/a?b=1 or mail help@shop.example',
      ['https://shop.example/a?b=1', 'help@shop.example'],
    ],
    ['Only 199.99 SAR, 15% off, 10:30', ['199.99', '15%', '10:30']],
    ['SKU TSH-BLK-01 and model A15', ['TSH-BLK-01', 'A15']],
  ])('%s', (text, protectedParts) => {
    const m = mask(text);
    expect(m.restore).toEqual(protectedParts);
    for (const p of protectedParts) expect(m.masked).not.toContain(p);
    expect(unmask(m.masked, m)).toBe(text);
  });

  it('does not treat ordinary capitalized words as codes', () => {
    expect(mask('New Arrivals TODAY').restore).toEqual([]);
  });

  it('applies glossary: do-not-translate keeps the term; preferred pair substitutes it', () => {
    const terms = [
      { term: 'Apple Pay' },
      { term: 'Apple' },
      { term: 'Buy now', replacement: '<<AR-BUY-NOW>>' },
    ];
    const m = mask('Buy now with Apple Pay or apple', { terms });
    expect(m.masked).toBe(`${T(0)} with ${T(1)} or ${T(2)}`);
    expect(unmask(fakeTranslate(m.masked), m)).toBe('<<AR-BUY-NOW>> WITH Apple Pay OR apple');
  });

  it('respects word boundaries for glossary terms (incl. Arabic letters)', () => {
    expect(mask('Pineapple', { terms: [{ term: 'apple' }] }).restore).toEqual([]);
  });

  it('preserves surrounding whitespace and flags strings with nothing to translate', () => {
    const m = mask('  Hello  ');
    expect(unmask('HELLO', m)).toBe('  HELLO  ');
    expect(mask('TSH-01 199.99').translatable).toBe(false);
    expect(mask('{name}').translatable).toBe(false);
    expect(mask('Hi {name}').translatable).toBe(true);
  });
});

describe('unmask rejects mangled provider output', () => {
  const m = mask('Hi {name}, {count} new');
  it.each([
    ['missing token', `HI ${T(0)} NEW`],
    ['duplicated token', `HI ${T(0)} ${T(0)} ${T(1)}`],
    ['unknown token', `HI ${T(0)} ${T(1)} ${T(7)}`],
    ['stray bracket', `HI ${T(0)} ${T(1)} ⟦`],
  ])('%s', (_, out) => expect(() => unmask(out, m)).toThrow(MaskMismatchError));

  it('tolerates spaces the engine inserts inside tokens', () => {
    expect(unmask('HI ⟦ 0 ⟧ ⟦1 ⟧ NEW', m)).toBe('HI {name} {count} NEW');
  });
});

describe('rejectReason', () => {
  it('rejects empty, injected markup and absurd lengths', () => {
    expect(rejectReason('Hello', '  ')).toBe('empty');
    expect(rejectReason('Hello', 'مرحبا <script>')).toBe('markup_changed');
    expect(rejectReason('A reasonably long product description', 'x')).toBe('length_ratio');
    expect(rejectReason('<b>Hi</b>', '<b>HI</b>')).toBeNull();
  });
});
