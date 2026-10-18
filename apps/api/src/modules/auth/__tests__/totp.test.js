import { describe, expect, it } from 'vitest';
import { sha256 } from '../../../core/crypto.js';
import {
  decodeBase32,
  encodeBase32,
  formatRecoveryCode,
  generateOtpAuthUri,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyRecoveryCode,
  verifyTotp,
} from '../totp.js';

describe('RFC 6238 TOTP module', () => {
  describe('Base32 encoding and decoding', () => {
    it('encodes and decodes standard test strings correctly', () => {
      const ascii = '12345678901234567890';
      const buf = Buffer.from(ascii, 'ascii');
      const b32 = encodeBase32(buf);
      expect(b32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');

      const decoded = decodeBase32(b32);
      expect(decoded.toString('ascii')).toBe(ascii);
    });

    it('handles padding, hyphens, and whitespace in decodeBase32', () => {
      const b32 = 'gez-dgnb  vgy3t-qojq=';
      const decoded = decodeBase32(b32);
      expect(decoded.toString('ascii')).toBe('1234567890');
    });

    it('throws error on invalid base32 characters', () => {
      expect(() => decodeBase32('INVALID!CHAR89')).toThrow(/Invalid Base32 character/);
    });

    it('generates random secrets of expected length', () => {
      const secret = generateTotpSecret(20);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(32); // 20 bytes = 160 bits / 5 bits per char = 32 chars
      const buf = decodeBase32(secret);
      expect(buf.length).toBe(20);
    });
  });

  describe('RFC 6238 test vectors', () => {
    // Secret: ASCII "12345678901234567890" => Base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    it('produces exact RFC 6238 Appendix B test vector at T=59s (step 1)', () => {
      const code8 = generateTotp(secret, { step: 30, digits: 8, timestamp: 59 * 1000 });
      expect(code8).toBe('94287082');

      const code6 = generateTotp(secret, { step: 30, digits: 6, timestamp: 59 * 1000 });
      expect(code6).toBe('287082');
    });

    it('produces exact RFC 6238 Appendix B test vector at T=1111111109s', () => {
      const code8 = generateTotp(secret, { step: 30, digits: 8, timestamp: 1111111109 * 1000 });
      expect(code8).toBe('07081804');

      const code6 = generateTotp(secret, { step: 30, digits: 6, timestamp: 1111111109 * 1000 });
      expect(code6).toBe('081804');
    });

    it('produces exact RFC 6238 Appendix B test vector at T=1234567890s', () => {
      const code8 = generateTotp(secret, { step: 30, digits: 8, timestamp: 1234567890 * 1000 });
      expect(code8).toBe('89005924');

      const code6 = generateTotp(secret, { step: 30, digits: 6, timestamp: 1234567890 * 1000 });
      expect(code6).toBe('005924');
    });
  });

  describe('verifyTotp', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const now = 1000000000 * 1000;

    it('verifies valid current code', () => {
      const code = generateTotp(secret, { timestamp: now });
      expect(verifyTotp(code, secret, { timestamp: now })).toBe(true);
    });

    it('allows drift within window (step -1 and step +1)', () => {
      const prevCode = generateTotp(secret, { timestamp: now - 30 * 1000 });
      const nextCode = generateTotp(secret, { timestamp: now + 30 * 1000 });

      expect(verifyTotp(prevCode, secret, { timestamp: now, window: 1 })).toBe(true);
      expect(verifyTotp(nextCode, secret, { timestamp: now, window: 1 })).toBe(true);
    });

    it('rejects drift outside window', () => {
      const farCode = generateTotp(secret, { timestamp: now - 60 * 1000 });
      expect(verifyTotp(farCode, secret, { timestamp: now, window: 1 })).toBe(false);
    });

    it('rejects invalid formatting or wrong digits', () => {
      expect(verifyTotp('12345', secret, { timestamp: now })).toBe(false);
      expect(verifyTotp('1234567', secret, { timestamp: now })).toBe(false);
      expect(verifyTotp('abcdef', secret, { timestamp: now })).toBe(false);
      expect(verifyTotp('', secret, { timestamp: now })).toBe(false);
      expect(verifyTotp(null, secret, { timestamp: now })).toBe(false);
    });
  });

  describe('generateOtpAuthUri', () => {
    it('generates a standard otpauth URL', () => {
      const uri = generateOtpAuthUri({
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'admin@supershop.sa',
        issuer: 'SuperShop POS',
      });
      expect(uri).toBe(
        'otpauth://totp/SuperShop%20POS:admin%40supershop.sa?secret=JBSWY3DPEHPK3PXP&issuer=SuperShop%20POS&algorithm=SHA1&digits=6&period=30',
      );
    });
  });

  describe('Recovery codes', () => {
    it('generates recovery codes and matching hashes', () => {
      const { codes, hashes } = generateRecoveryCodes(8);
      expect(codes.length).toBe(8);
      expect(hashes.length).toBe(8);

      for (const code of codes) {
        expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
      }

      // Test verification
      const targetCode = codes[2];
      const result = verifyRecoveryCode(targetCode, hashes);
      expect(result.valid).toBe(true);
      expect(result.matchedHash).toBe(hashes[2]);
    });

    it('verifies code case-insensitively and without hyphens', () => {
      const raw = 'a1b2c3d4e5f6';
      const formatted = formatRecoveryCode(raw);
      const { hashes } = generateRecoveryCodes(1);
      // Manually replace hashes[0] with hash of raw
      const normalized = normalizeRecoveryCode(raw);
      hashes[0] = sha256(normalized);

      expect(verifyRecoveryCode(formatted, hashes).valid).toBe(true);
      expect(verifyRecoveryCode('A1B2-C3D4-E5F6', hashes).valid).toBe(true);
      expect(verifyRecoveryCode('a1b2 c3d4 e5f6', hashes).valid).toBe(true);
      expect(verifyRecoveryCode('a1b2c3d4e5f6', hashes).valid).toBe(true);
      expect(verifyRecoveryCode('wrong-code-here', hashes).valid).toBe(false);
    });
  });
});
