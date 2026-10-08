import mongoose from 'mongoose';

/**
 * Supplier (internal purchasing data; never public, never translated). Contact details are
 * business contacts, visible only to supplier/purchase permissions. Soft-deleted.
 */
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    /** Lower-cased name for case-insensitive uniqueness. */
    nameKey: { type: String, required: true },
    contactName: { type: String, default: null },
    /** E.164 (normalized by the shared phone validator). */
    phone: { type: String, default: null },
    email: { type: String, default: null },
    address: { type: String, default: null },
    /** VAT / tax registration number (ZATCA for Saudi suppliers). */
    taxNumber: { type: String, default: null },
    /** Commercial registration (CR) number. */
    registrationNumber: { type: String, default: null },
    paymentTermsDays: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'suppliers', timestamps: true },
);
supplierSchema.index(
  { nameKey: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);

export const Supplier = mongoose.models.Supplier ?? mongoose.model('Supplier', supplierSchema);
