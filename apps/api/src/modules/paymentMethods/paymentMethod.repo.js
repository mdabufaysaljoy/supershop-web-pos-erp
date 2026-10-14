import { PaymentMethodModel } from './paymentMethod.model.js';

/** The ONLY place touching the payment-method model. */

export const listAll = () => PaymentMethodModel.find({}).sort({ position: 1, _id: 1 }).lean();
export const listEnabled = () =>
  PaymentMethodModel.find({ enabled: true }).sort({ position: 1, _id: 1 }).lean();
export const findById = (id) => PaymentMethodModel.findById(id).lean();
export const findByKey = (key) => PaymentMethodModel.findOne({ key }).lean();
export const countAll = () => PaymentMethodModel.countDocuments({});

export const insert = async (data) => (await PaymentMethodModel.create(data)).toObject();

/** Localized fields need `doc.save()` so the translation hooks run (D-045). */
export async function updateDoc(id, apply) {
  const doc = await PaymentMethodModel.findById(id);
  if (!doc) return null;
  apply(doc);
  await doc.save();
  return doc.toObject();
}

export const remove = (id) => PaymentMethodModel.deleteOne({ _id: id, builtIn: false });

export const setPositions = (ids) =>
  PaymentMethodModel.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { position: index } } },
    })),
  );
