import mongoose from 'mongoose';
import { PAYMENT_METHOD } from '@supershop/shared';
import { localized, LocalizedString } from '../i18n/index.js';

const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * A payment method the shop offers (P4.2). Admin data, not code: the two built-in keys are seeded
 * and can be renamed, priced or switched off, and a shop may add its own offline methods.
 * `key` is what orders snapshot, so it never changes once created.
 */
const paymentMethodSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: PAYMENT_METHOD.TYPES },
    /** Shown to the customer (English source, Arabic generated). */
    label: localizedField(),
    /** How to pay, for offline methods: IBAN, counter opening hours… */
    instructions: localizedField(),
    enabled: { type: Boolean, default: true },
    /** Order in the checkout list; the admin drags to change it. */
    position: { type: Number, default: 0 },
    fee: {
      fixed: { type: Number, default: 0 },
      bps: { type: Number, default: 0 },
    },
    iconId: { type: mongoose.Schema.Types.ObjectId, default: null },
    minTotal: { type: Number, default: null },
    maxTotal: { type: Number, default: null },
    /** Seeded methods cannot be deleted — checkout knows how to finish them. */
    builtIn: { type: Boolean, default: false },
  },
  { collection: 'payment_methods', timestamps: true },
);
paymentMethodSchema.index({ position: 1 });
paymentMethodSchema.plugin(localized, { fields: ['label', 'instructions'] });

export const PaymentMethodModel =
  mongoose.models.PaymentMethod ?? mongoose.model('PaymentMethod', paymentMethodSchema);
