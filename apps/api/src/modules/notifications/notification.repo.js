import { NotificationLog, NotificationTemplate } from './notification.model.js';

/** The ONLY place touching the notification models. */

export const listTemplates = () =>
  NotificationTemplate.find({}).sort({ event: 1, channel: 1 }).lean();
export const findTemplate = (key) => NotificationTemplate.findOne({ key }).lean();
export const findTemplateById = (id) => NotificationTemplate.findById(id).lean();
export const countTemplates = () => NotificationTemplate.countDocuments({});
export const insertTemplate = async (data) => (await NotificationTemplate.create(data)).toObject();

/** Localized fields need `doc.save()` so the translation hooks run (D-045). */
export async function updateTemplate(id, apply) {
  const doc = await NotificationTemplate.findById(id);
  if (!doc) return null;
  apply(doc);
  await doc.save();
  return doc.toObject();
}

export const insertLog = (data) => NotificationLog.create(data).then((d) => d.toObject());
export async function listLogs(filter, { skip, limit }) {
  const [items, total] = await Promise.all([
    NotificationLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    NotificationLog.countDocuments(filter),
  ]);
  return { items, total };
}
