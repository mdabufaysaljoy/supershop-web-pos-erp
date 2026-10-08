import mongoose from 'mongoose';
import { PRINCIPAL_TYPES } from '@supershop/shared';

/**
 * Auth-owned collections. Principal profiles (name, email, status…) live in the staff/customers
 * modules; ONLY this module ever sees password hashes or token hashes.
 */
const { Schema } = mongoose;
const principalType = { type: String, enum: Object.values(PRINCIPAL_TYPES), required: true };

/** One per principal that has a password. */
const credentialSchema = new Schema(
  {
    principalType,
    principalId: { type: Schema.Types.ObjectId, required: true },
    passwordHash: { type: String, required: true },
    passwordChangedAt: { type: Date, required: true },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { collection: 'auth_credentials', timestamps: true },
);
credentialSchema.index({ principalType: 1, principalId: 1 }, { unique: true });

/**
 * A login session = one refresh-token family. Rotation replaces `tokenHash`; presenting any
 * other token of the family (outside the grace window) revokes the whole session.
 */
const sessionSchema = new Schema(
  {
    principalType,
    principalId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true },
    prevTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 256 },
    ip: { type: String, maxlength: 64 },
  },
  { collection: 'auth_sessions', timestamps: true },
);
sessionSchema.index({ principalType: 1, principalId: 1, revokedAt: 1 });
// Purge 30 days after the absolute expiry (kept a while for security investigations).
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

/** Single-use tokens sent by email (password reset, email verification). */
const authTokenSchema = new Schema(
  {
    principalType,
    principalId: { type: Schema.Types.ObjectId, required: true },
    purpose: { type: String, enum: ['password_reset', 'email_verify'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: 'auth_tokens', timestamps: { createdAt: true, updatedAt: false } },
);
authTokenSchema.index({ principalType: 1, principalId: 1, purpose: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const model = (name, schema) => mongoose.models[name] ?? mongoose.model(name, schema);

export const Credential = model('AuthCredential', credentialSchema);
export const Session = model('AuthSession', sessionSchema);
export const AuthToken = model('AuthToken', authTokenSchema);
