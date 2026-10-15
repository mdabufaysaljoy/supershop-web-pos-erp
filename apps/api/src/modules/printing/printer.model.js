import mongoose from 'mongoose';
import { PRINTING } from '@supershop/shared';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A printer the shop has (P6.3): which machine, what it prints, and on what paper. Profiles are
 * DATA — a shop plugs in another till printer and adds a row, nobody deploys anything.
 */
const printerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    /** The printer's name as the operating system (and so QZ Tray) knows it. */
    printer: { type: String, required: true },
    kind: { type: String, enum: PRINTING.KINDS, default: 'receipt' },
    widthMm: { type: Number, enum: [...PRINTING.WIDTHS_MM], default: 80 },
    /** Only this branch's tills use it; null = any branch. */
    branchId: { type: ObjectId, default: null },
    cut: { type: Boolean, default: true },
    openDrawer: { type: Boolean, default: false },
    /** The one a till reaches for when nobody chose: one per kind and branch. */
    isDefault: { type: Boolean, default: false },
    updatedBy: { type: ObjectId, default: null },
  },
  { collection: 'printer_profiles', timestamps: true },
);

printerSchema.index({ kind: 1, branchId: 1 });

export const PrinterProfile =
  mongoose.models.PrinterProfile ?? mongoose.model('PrinterProfile', printerSchema);
