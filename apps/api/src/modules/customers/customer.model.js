import mongoose from 'mongoose';
import { ACCOUNT, LANGUAGES } from '@supershop/shared';

/**
 * Customer. May exist without a password (guest checkout, P3.4); authentication data lives in
 * the auth module. Email and phone are each unique when present.
 */
const { Schema } = mongoose;
const { Mixed } = Schema.Types;

/**
 * Address book entry (P3.5). The address itself is stored exactly as the shared
 * `shippingAddressSchema` validated it, so checkout and the order snapshot see one shape; adding a
 * field there needs no migration here. Contact name/phone stay on the profile.
 */
const addressSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: ACCOUNT.LABEL_MAX, default: null },
    address: { type: Mixed, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: null },
    emailVerifiedAt: { type: Date, default: null },
    phone: { type: String, default: null }, // normalized E.164
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lang: { type: String, enum: Object.values(LANGUAGES), default: LANGUAGES.EN },
    marketingOptOut: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    /** Saved shipping addresses, newest last; at most one `isDefault`. */
    addresses: { type: [addressSchema], default: [] },
    /** Identity providers linked to this account: `{ provider: 'google', sub, linkedAt }`. */
    identities: {
      type: [
        new Schema(
          {
            provider: { type: String, required: true },
            /** The provider's stable user id — never an email (emails move between people). */
            sub: { type: String, required: true },
            linkedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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

customerSchema.index(
  { 'identities.provider': 1, 'identities.sub': 1 },
  { partialFilterExpression: { 'identities.0': { $exists: true } } },
);
customerSchema.index({ createdAt: -1 });
customerSchema.index({ status: 1, createdAt: -1 });
customerSchema.index({ deletedAt: 1, createdAt: -1 });

export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema);
