import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  maskSecret,
  randomToken,
  safeEqual,
  sha256,
} from '../crypto.js';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips unicode text and uses a fresh IV every time', () => {
    const secret = 'sk_live_مفتاح_🔑';
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain(secret);
    expect(decryptSecret(a)).toBe(secret);
  });

  it('round-trips an empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('detects tampering', () => {
    const [v, iv, tag, ct] = encryptSecret('hello world').split('.');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow(
      'Decryption failed',
    );
  });

  it('fails with the wrong key or wrong AAD context', () => {
    const enc = encryptSecret('x', { aad: 'settings:sms.token' });
    expect(decryptSecret(enc, { aad: 'settings:sms.token' })).toBe('x');
    expect(() => decryptSecret(enc, { aad: 'settings:email.token' })).toThrow();
    expect(() => decryptSecret(enc)).toThrow();
    expect(() => decryptSecret(enc, { key: randomBytes(32), aad: 'settings:sms.token' })).toThrow();
  });

  it('rejects malformed payloads and bad keys', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow('Malformed');
    expect(() => decryptSecret('v2.a.b.c')).toThrow('Malformed');
    expect(() => encryptSecret('x', { key: randomBytes(16) })).toThrow('32 bytes');
  });
});

describe('helpers', () => {
  it('maskSecret never reveals short secrets', () => {
    expect(maskSecret('abc')).toBe('••••');
    expect(maskSecret('sk_live_1234567890')).toBe('••••7890');
    expect(maskSecret(undefined)).toBe('');
  });

  it('sha256, randomToken, safeEqual', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(randomToken()).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('a', undefined)).toBe(false);
  });
});
