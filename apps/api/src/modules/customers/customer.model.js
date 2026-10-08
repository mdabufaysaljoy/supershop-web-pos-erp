import mongoose from 'mongoose';
import { LANGUAGES } from '@supershop/shared';

/**
 * Customer. May exist without a password (guest checkout, P3.4); authentication data lives in
 * the auth module. Email and phone are each unique when present.
 */
const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: null },
    emailVerifiedAt: { type: Date, default: null },
    phone: { type: String, default: null }, // normalized E.164
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lang: { type: String, enum: Object.values(LANGUAGES), default: LANGUAGES.EN },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'customers', timestamps: true },
);
customerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
customerSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);

export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema);
