import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

/**
 * Branch = a store or warehouse (CLAUDE.md §2.4: stock, sales, shifts and reports carry
 * `branchId`). The name is auto-translated; the address (Saudi National Address) is data.
 * Soft-deleted; deactivated branches keep their history and assignments.
 */
const addressSchema = new mongoose.Schema(
  {
    buildingNumber: { type: String, default: null },
    street: { type: String, default: null },
    district: { type: String, default: null },
    city: { type: String, default: null },
    postalCode: { type: String, default: null },
    additionalNumber: { type: String, default: null },
    shortAddress: { type: String, default: null },
  },
  { _id: false },
);

const branchSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: LocalizedString, default: () => ({}) },
    type: { type: String, default: 'store' },
    address: { type: addressSchema, default: () => ({}) },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    location: {
      type: new mongoose.Schema({ lat: Number, lng: Number }, { _id: false }),
      default: null,
    },
    isActive: { type: Boolean, default: true },
    fulfillsOnlineOrders: { type: Boolean, default: false },
    pickupEnabled: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'branches', timestamps: true },
);
branchSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
branchSchema.plugin(localized, { fields: ['name'] });

export const Branch = mongoose.models.Branch ?? mongoose.model('Branch', branchSchema);
