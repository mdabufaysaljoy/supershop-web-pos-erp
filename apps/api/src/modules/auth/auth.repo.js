import mongoose from 'mongoose';
import { AuthToken, Credential, Session } from './auth.model.js';

/** Data access for the auth module. The only file that touches auth models. */

// ---------- credentials ----------
export const findCredential = (principalType, principalId) =>
  Credential.findOne({ principalType, principalId }).lean();

/** Creates or replaces the password; clears lockout. */
export const upsertPassword = (principalType, principalId, passwordHash, { session } = {}) =>
  Credential.findOneAndUpdate(
    { principalType, principalId },
    {
      $set: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    },
    { upsert: true, returnDocument: 'after', session, lean: true },
  );

export const updatePasswordHash = (id, passwordHash) =>
  Credential.updateOne({ _id: id }, { $set: { passwordHash } });

/**
 * Atomically counts a failed login. When the count reaches `maxAttempts`, locks the account for
 * `lockMs` and resets the counter (so the next window starts fresh after the lock expires).
 * @returns {Promise<{ locked: boolean, lockedUntil: Date | null }>}
 */
export async function recordLoginFailure(id, { maxAttempts, lockMs }) {
  const lockUntil = new Date(Date.now() + lockMs);
  const doc = await Credential.findOneAndUpdate(
    { _id: id },
    [
      { $set: { _next: { $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] } } },
      {
        $set: {
          lockedUntil: { $cond: [{ $gte: ['$_next', maxAttempts] }, lockUntil, '$lockedUntil'] },
          failedLoginCount: { $cond: [{ $gte: ['$_next', maxAttempts] }, 0, '$_next'] },
        },
      },
      { $unset: '_next' },
    ],
    { returnDocument: 'after', lean: true, updatePipeline: true },
  );
  const locked = Boolean(doc?.lockedUntil && doc.lockedUntil.getTime() === lockUntil.getTime());
  return { locked, lockedUntil: doc?.lockedUntil ?? null };
}

export const recordLoginSuccess = (id) =>
  Credential.updateOne(
    { _id: id },
    { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } },
  );

// ---------- sessions ----------
/** New session id as a hex string (the refresh token embeds it). */
export const newSessionId = () => new mongoose.Types.ObjectId().toHexString();

export const createSession = (data) => Session.create(data).then((d) => d.toObject());

export const findSessionById = (id) => Session.findById(id).lean();

/** Lightweight check used on every authenticated request. */
export const findActiveSession = (id, principalType) =>
  Session.findOne(
    {
      _id: id,
      principalType,
      revokedAt: null,
      idleExpiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() },
    },
    { principalId: 1 },
  ).lean();

/**
 * Compare-and-swap rotation: succeeds only if the presented hash is still current and the session
 * is live. Returns the updated session or null (lost a race / revoked).
 */
export const rotateSession = (id, currentHash, { newHash, idleExpiresAt }) =>
  Session.findOneAndUpdate(
    { _id: id, tokenHash: currentHash, revokedAt: null },
    {
      $set: {
        tokenHash: newHash,
        prevTokenHash: currentHash,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        idleExpiresAt,
      },
    },
    { returnDocument: 'after', lean: true },
  );

export const revokeSession = (id, reason) =>
  Session.updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } },
  );

/** @returns {Promise<number>} sessions revoked */
export async function revokeSessionsOf(principalType, principalId, reason, { exceptId } = {}) {
  const filter = { principalType, principalId, revokedAt: null };
  if (exceptId) filter._id = { $ne: exceptId };
  const res = await Session.updateMany(filter, {
    $set: { revokedAt: new Date(), revokeReason: reason },
  });
  return res.modifiedCount;
}

/** Oldest-first active session ids beyond `keep` (to cap concurrent sessions). */
export async function findExcessSessionIds(principalType, principalId, keep) {
  const docs = await Session.find(
    { principalType, principalId, revokedAt: null, absoluteExpiresAt: { $gt: new Date() } },
    { _id: 1 },
  )
    .sort({ createdAt: -1 })
    .skip(keep)
    .lean();
  return docs.map((d) => d._id);
}

export const revokeSessionsByIds = (ids, reason) =>
  ids.length
    ? Session.updateMany(
        { _id: { $in: ids }, revokedAt: null },
        { $set: { revokedAt: new Date(), revokeReason: reason } },
      )
    : Promise.resolve();

// ---------- one-time tokens ----------
/** Issues a token and invalidates older unused tokens of the same purpose. */
export async function replaceAuthToken({
  principalType,
  principalId,
  purpose,
  tokenHash,
  expiresAt,
}) {
  await AuthToken.deleteMany({ principalType, principalId, purpose, usedAt: null });
  return AuthToken.create({ principalType, principalId, purpose, tokenHash, expiresAt });
}

/** Atomically marks a valid token used. Returns the token doc or null (unknown/expired/used). */
export const consumeAuthToken = (tokenHash, purpose, principalType) =>
  AuthToken.findOneAndUpdate(
    { tokenHash, purpose, principalType, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after', lean: true },
  );
