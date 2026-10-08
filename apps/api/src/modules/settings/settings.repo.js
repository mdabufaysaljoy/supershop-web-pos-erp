import { Setting } from './settings.model.js';

export const findAllSettings = () => Setting.find().lean();

export const upsertSetting = (
  key,
  { value = null, encryptedValue = null, updatedBy = null },
  { session } = {},
) =>
  Setting.findOneAndUpdate(
    { key },
    { $set: { value, encryptedValue, updatedBy } },
    { upsert: true, returnDocument: 'after', lean: true, session },
  );

export const deleteSettings = (keys, { session } = {}) =>
  Setting.deleteMany({ key: { $in: keys } }, { session });
