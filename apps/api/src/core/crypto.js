import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from './config.js';

/**
 * AES-256-GCM encryption for secrets stored in the DB (gateway keys, SMS tokens, CAPI tokens…),
 * CLAUDE.md §5.1. Format: `v1.<iv>.<authTag>.<ciphertext>` (base64url parts).
 * The version prefix leaves room for key rotation (a future `v2` can carry a key id).
 */
const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const masterKey = () => Buffer.from(config.MASTER_KEY, 'base64');

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error('Encryption key must be 32 bytes');
}

/**
 * @param {string} plaintext
 * @param {{ key?: Buffer, aad?: string }} [opts] `aad` binds the ciphertext to a context
 *   (e.g. `'settings:payments.apiKey'`) so it cannot be copied to another field.
 * @returns {string}
 */
export function encryptSecret(plaintext, { key = masterKey(), aad } = {}) {
  if (typeof plaintext !== 'string') throw new TypeError('plaintext must be a string');
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/**
 * @param {string} payload output of encryptSecret
 * @param {{ key?: Buffer, aad?: string }} [opts] must match the values used to encrypt
 * @returns {string}
 * @throws {Error} if the payload is malformed, tampered with, or the key/aad differ
 */
export function decryptSecret(payload, { key = masterKey(), aad } = {}) {
  assertKey(key);
  const parts = typeof payload === 'string' ? payload.split('.') : [];
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Malformed encrypted payload');
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
    throw new Error('Malformed encrypted payload');
  try {
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Decryption failed');
  }
}

/** True if the value looks like an encryptSecret payload (so it is not double-encrypted). */
export const isEncrypted = (value) =>
  typeof value === 'string' && /^v1\.[\w-]+\.[\w-]+\.[\w-]*$/.test(value);

/**
 * Masks a secret for display: only the last 4 chars are shown, and only for long values.
 * @param {string | null | undefined} value
 */
export function maskSecret(value) {
  if (!value) return '';
  return value.length >= 12 ? `••••${value.slice(-4)}` : '••••';
}

/** SHA-256 hex digest (tokens at rest, cache keys, tracking PII hashing). */
export const sha256 = (input) => createHash('sha256').update(input).digest('hex');

/** Cryptographically secure random token, base64url. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Constant-time string comparison (length-independent: compares digests). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
