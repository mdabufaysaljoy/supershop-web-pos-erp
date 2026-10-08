import { validators } from '@supershop/shared';
import { describe, expect, it, vi } from 'vitest';
import { applySanitizer, blockInvalidInsertion } from '../fields/sanitizeInput.js';

const input = (value, caret) => {
  const el = document.createElement('input');
  el.value = value;
  el.setSelectionRange(caret, caret);
  return el;
};

describe('blockInvalidInsertion', () => {
  it('blocks characters the sanitizer drops, allows ones it only transforms', () => {
    const ev = (data) => ({ data, preventDefault: vi.fn() });
    const digit = ev('x');
    expect(blockInvalidInsertion(digit, validators.sanitizeInteger)).toBe(true);
    expect(digit.preventDefault).toHaveBeenCalled();

    const upper = ev('A'); // email lower-cases 'A' (same length) → must NOT be blocked
    expect(blockInvalidInsertion(upper, validators.sanitizeEmail)).toBe(false);
    expect(upper.preventDefault).not.toHaveBeenCalled();

    const arabicDigit = ev('٥');
    expect(blockInvalidInsertion(arabicDigit, validators.sanitizeInteger)).toBe(false);
    expect(blockInvalidInsertion(ev(null), validators.sanitizeInteger)).toBe(false); // deletions
  });

  it('never blocks a partly-valid multi-character insertion (mobile predictions, IME, autocomplete)', () => {
    // Regression: blocking whole insertions here erased the user's text on mobile keyboards.
    const ev = { data: '  X@Y.Z  ', preventDefault: vi.fn() };
    expect(blockInvalidInsertion(ev, validators.sanitizeEmail)).toBe(false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    const allBad = { data: 'abc', preventDefault: vi.fn() };
    expect(blockInvalidInsertion(allBad, validators.sanitizeInteger)).toBe(true);
  });
});

describe('applySanitizer', () => {
  it('removes an invalid char typed mid-text and keeps the caret in place', () => {
    const el = input('12x34', 3); // user typed 'x' after "12", caret after x
    expect(applySanitizer(el, validators.sanitizeInteger)).toBe(true);
    expect(el.value).toBe('1234');
    expect(el.selectionStart).toBe(2);
  });

  it('keeps caret correct when pasting a messy phone number mid-field', () => {
    const el = input('05 (12) 345', 7);
    applySanitizer(el, validators.sanitizePhone);
    expect(el.value).toBe('0512345');
    expect(el.selectionStart).toBe(4); // "05 (12)" → "0512"
  });

  it('normalizes Arabic digits without moving the caret', () => {
    const el = input('٠٥١٢', 2);
    applySanitizer(el, validators.sanitizePhone);
    expect(el.value).toBe('0512');
    expect(el.selectionStart).toBe(2);
  });

  it('returns false and leaves clean values untouched', () => {
    const el = input('abc', 1);
    expect(applySanitizer(el, (v) => v)).toBe(false);
    expect(el.selectionStart).toBe(1);
  });
});

describe('sanitizers are prefix-consistent (required by the caret math)', () => {
  const samples = [
    '',
    'a',
    '0512 345-678',
    '+966 5x1',
    '١٢٫٥٦٧',
    'Jo3hn محمد',
    '<b>hi</b>',
    'Sku-01/x',
    '..5',
    'a@B .C',
  ];
  const names = [
    'sanitizeName',
    'sanitizePhone',
    'sanitizeMoney',
    'sanitizeInteger',
    'sanitizeCode',
    'sanitizeEmail',
    'sanitizePlainText',
  ];
  it.each(names)('%s', (name) => {
    const s = validators[name];
    for (const text of samples) {
      for (let i = 0; i <= text.length; i += 1) {
        expect(
          s(text).startsWith(s(text.slice(0, i))),
          `${name}(${JSON.stringify(text)}) @${i}`,
        ).toBe(true);
      }
    }
  });
});
