import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual, sha256 } from '../../core/crypto.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer/Uint8Array to RFC 4648 Base32 string (without padding).
 * @param {Buffer | Uint8Array} buffer
 * @returns {string}
 */
export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i += 1) {
    value = ((value << 8) | buffer[i]) >>> 0;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes an RFC 4648 Base32 string to Buffer.
 * Ignores whitespace, hyphens, and standard padding '='.
 * @param {string} input
 * @returns {Buffer}
 */
export function decodeBase32(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Base32 input must be a string');
  }
  const cleaned = input.replace(/[\s=-]/g, '').toUpperCase();
  const map = {};
  for (let i = 0; i < BASE32_ALPHABET.length; i += 1) {
    map[BASE32_ALPHABET[i]] = i;
  }

  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const val = map[cleaned[i]];
    if (val === undefined) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = ((value << 5) | val) >>> 0;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random Base32 secret for TOTP (default 20 bytes = 160 bits).
 * @param {number} [bytes=20]
 * @returns {string}
 */
export function generateTotpSecret(bytes = 20) {
  return encodeBase32(randomBytes(bytes));
}

/**
 * Generates an RFC 6238 TOTP value for a Base32 secret at a given timestamp.
 *
 * @param {string} secret Base32-encoded secret
 * @param {object} [opts]
 * @param {number} [opts.step=30] Time step in seconds
 * @param {number} [opts.digits=6] Code length
 * @param {number} [opts.timestamp] Epoch milliseconds (defaults to Date.now())
 * @returns {string}
 */
export function generateTotp(secret, { step = 30, digits = 6, timestamp = Date.now() } = {}) {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 1000 / step);

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeNum = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(codeNum).padStart(digits, '0');
}

/**
 * Timing-safe verification of an RFC 6238 TOTP value with clock drift tolerance.
 *
 * @param {string} token The 6-digit TOTP token to verify
 * @param {string} secret Base32-encoded secret
 * @param {object} [opts]
 * @param {number} [opts.window=1] Number of steps to check before and after current time
 * @param {number} [opts.step=30] Time step in seconds
 * @param {number} [opts.digits=6] Code length
 * @param {number} [opts.timestamp] Epoch milliseconds
 * @returns {boolean}
 */
export function verifyTotp(
  token,
  secret,
  { window = 1, step = 30, digits = 6, timestamp = Date.now() } = {},
) {
  if (typeof token !== 'string') return false;
  const cleaned = token.trim();
  if (cleaned.length !== digits || !/^\d+$/.test(cleaned)) return false;

  let valid = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = generateTotp(secret, {
      step,
      digits,
      timestamp: timestamp + offset * step * 1000,
    });
    if (safeEqual(candidate, cleaned)) {
      valid = true;
    }
  }
  return valid;
}

/**
 * Builds standard `otpauth://totp/...` URI for authenticator apps.
 *
 * @param {object} params
 * @param {string} params.secret Base32-encoded secret
 * @param {string} params.accountName E.g. staff email
 * @param {string} [params.issuer='SuperShop']
 * @returns {string}
 */
export function generateOtpAuthUri({ secret, accountName, issuer = 'SuperShop' }) {
  const safeIssuer = encodeURIComponent(issuer.trim());
  const safeAccount = encodeURIComponent(accountName.trim());
  return `otpauth://totp/${safeIssuer}:${safeAccount}?secret=${encodeURIComponent(secret)}&issuer=${safeIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Formats 12 hex characters into `xxxx-xxxx-xxxx`.
 * @param {string} hex
 * @returns {string}
 */
export function formatRecoveryCode(hex) {
  const clean = hex
    .replace(/[^a-fA-F0-9]/g, '')
    .toLowerCase()
    .slice(0, 12);
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

/**
 * Normalizes a recovery code string for hashing and comparison.
 * @param {string} code
 * @returns {string}
 */
export function normalizeRecoveryCode(code) {
  return String(code ?? '')
    .replace(/[-\s]/g, '')
    .toLowerCase();
}

/**
 * Generates single-use recovery codes.
 *
 * @param {number} [count=8]
 * @returns {{ codes: string[], hashes: string[] }}
 */
export function generateRecoveryCodes(count = 8) {
  const codes = [];
  const hashes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(6).toString('hex');
    const formatted = formatRecoveryCode(raw);
    codes.push(formatted);
    hashes.push(sha256(normalizeRecoveryCode(formatted)));
  }
  return { codes, hashes };
}

/**
 * Verifies a single-use recovery code against stored hashes.
 *
 * @param {string} enteredCode
 * @param {string[]} storedHashes
 * @returns {{ valid: boolean, matchedHash: string | null }}
 */
export function verifyRecoveryCode(enteredCode, storedHashes) {
  if (typeof enteredCode !== 'string' || !Array.isArray(storedHashes)) {
    return { valid: false, matchedHash: null };
  }
  const normalized = normalizeRecoveryCode(enteredCode);
  if (normalized.length !== 12 || !/^[0-9a-f]{12}$/.test(normalized)) {
    return { valid: false, matchedHash: null };
  }
  const hash = sha256(normalized);
  for (const stored of storedHashes) {
    if (safeEqual(stored, hash)) {
      return { valid: true, matchedHash: stored };
    }
  }
  return { valid: false, matchedHash: null };
}
