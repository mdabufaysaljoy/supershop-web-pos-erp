import argon2 from 'argon2';

/**
 * Password hashing with argon2id (CLAUDE.md §5.1). Parameters = OWASP minimum recommendation
 * (19 MiB memory, 2 iterations, 1 lane). Hashes are self-describing, so raising the parameters
 * later upgrades users transparently on their next login (`needsRehash`).
 */
const OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

/** @param {string} plain */
export const hashPassword = (plain) => argon2.hash(plain, OPTIONS);

/**
 * @param {string} hash
 * @param {string} plain
 * @returns {Promise<boolean>} false on mismatch OR malformed hash (never throws for bad input)
 */
export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** @param {string} hash */
export const needsRehash = (hash) => argon2.needsRehash(hash, OPTIONS);

// Verified against when the account doesn't exist, so "unknown user" and "wrong password"
// take the same time (prevents user enumeration by timing).
let dummyHashPromise;
export function dummyHash() {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing-equalization');
  return dummyHashPromise;
}
