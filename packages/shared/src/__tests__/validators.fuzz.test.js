import { describe, expect, it } from 'vitest';
import * as v from '../validators/index.js';

/**
 * Property tests over random mixed-script input (deterministic seed → reproducible failures).
 * Guarantees the input components rely on: sanitizer output is always inside the allowed charset,
 * sanitizing twice changes nothing, and "complete" sanitized values pass the matching schema.
 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const POOL = [
  ...'abcXYZ0123456789 .-_\'+@<>&$/\\()[]{}#!?,;:"\t\n',
  ...'محمدالعتيبيّ٠١٢٣٤٥٦٧٨٩۰۱۲٫٬،',
  'é',
  'Ж',
  '😀',
  '\u0000',
  '\u0007',
  '‏',
  ' ',
];
const rand = rng(20261008);
const randomString = () => {
  const len = Math.floor(rand() * 24);
  let out = '';
  for (let i = 0; i < len; i += 1) out += POOL[Math.floor(rand() * POOL.length)];
  return out;
};
const SAMPLES = Array.from({ length: 3000 }, randomString);

const CASES = [
  ['sanitizeName', /^[\p{Script=Latin}\p{Script=Arabic}\p{M}' .-]*$/u, (s) => !/\p{N}/u.test(s)],
  ['sanitizePhone', /^\+?\d*$/],
  ['sanitizeMoney', /^\d*(\.\d{0,2})?$/],
  ['sanitizeInteger', /^\d*$/],
  ['sanitizeCode', /^[A-Z0-9_.-]*$/],
  ['sanitizeEmail', /^\S*$/, (s) => s === s.toLowerCase()],
  ['sanitizeSlug', /^[a-z0-9-]*$/, (s) => !s.includes('--')],
  // eslint-disable-next-line no-control-regex
  ['sanitizePlainText', /^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/],
];

describe.each(CASES)('%s', (name, allowed, extra) => {
  const sanitize = v[name];
  it('output stays within the allowed charset and is idempotent', () => {
    for (const s of SAMPLES) {
      const out = sanitize(s);
      expect(out, `${name}(${JSON.stringify(s)})`).toMatch(allowed);
      if (extra) expect(extra(out), `${name}(${JSON.stringify(s)}) extra`).toBe(true);
      expect(sanitize(out)).toBe(out);
    }
  });
});

describe('sanitized values that look complete pass their schema', () => {
  it('money: any non-empty sanitized amount with a digit parses to integer halalas', () => {
    const schema = v.moneyInput();
    for (const s of SAMPLES) {
      const out = v.sanitizeMoney(s).replace(/\.$/, ''); // trailing "12." is mid-typing
      if (!/\d/.test(out)) continue;
      const r = schema.safeParse(out);
      expect(r.success, JSON.stringify(out)).toBe(true);
      expect(Number.isSafeInteger(r.data)).toBe(true);
    }
  });

  it('phone: digits that form a KSA mobile always normalize to +9665XXXXXXXX', () => {
    for (let i = 0; i < 500; i += 1) {
      const local = `5${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`;
      const variants = [`0${local}`, local, `+966${local}`, `966${local}`, `00966${local}`];
      for (const variant of variants) {
        expect(v.phone().safeParse(v.sanitizePhone(variant)).data).toBe(`+966${local}`);
      }
    }
  });
});
