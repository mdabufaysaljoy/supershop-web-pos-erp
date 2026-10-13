import { CustomFieldDef } from './customField.model.js';

const ACTIVE = { deletedAt: null };

export const listForEntity = (entity) =>
  CustomFieldDef.find({ entity, ...ACTIVE })
    .sort({ position: 1, _id: 1 })
    .lean();
export const countForEntity = (entity) => CustomFieldDef.countDocuments({ entity, ...ACTIVE });
/** Includes deleted definitions: keys are never reused. */
export const keyExists = async (entity, key) =>
  Boolean(await CustomFieldDef.exists({ entity, key }));
export const createDef = (data) => new CustomFieldDef(data).save().then((d) => d.toObject());
export const loadForUpdate = (id) => CustomFieldDef.findOne({ _id: id, ...ACTIVE });
export const saveDoc = (doc) => doc.save().then((d) => d.toObject());
export const softDelete = (id) =>
  CustomFieldDef.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: 'after', lean: true },
  );
