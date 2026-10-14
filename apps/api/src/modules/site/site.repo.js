import { Menu } from './menu.model.js';
import { SiteLayout } from './layout.model.js';

/** The ONLY place touching the menu and layout models. */
const live = { deletedAt: null };

export const listMenus = () => Menu.find(live).sort({ location: 1, title: 1 }).lean();
export const findMenuById = (id) => Menu.findOne({ _id: id, ...live }).lean();
export const findMenusByIds = (ids) => Menu.find({ _id: { $in: ids }, ...live }).lean();
export const menuSlugExists = (slug, exceptId) =>
  Menu.exists({ slug, ...live, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
export const createMenu = async (data) => (await Menu.create(data)).toObject();

/** Localized fields need `doc.save()` so the translation hooks run (D-045). */
export async function updateMenu(id, apply) {
  const doc = await Menu.findOne({ _id: id, ...live });
  if (!doc) return null;
  await apply(doc);
  await doc.save();
  return doc.toObject();
}

export const softDeleteMenu = (id) =>
  Menu.findOneAndUpdate(
    { _id: id, ...live },
    { $set: { deletedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();

/** The singleton: created on first read so a fresh shop has defaults, not nothing. */
export async function getLayout() {
  const found = await SiteLayout.findOne({ key: 'default' }).lean();
  if (found) return found;
  await SiteLayout.updateOne(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true },
  );
  return SiteLayout.findOne({ key: 'default' }).lean();
}

export async function updateLayout(apply) {
  await getLayout(); // make sure it exists
  const doc = await SiteLayout.findOne({ key: 'default' });
  await apply(doc);
  await doc.save();
  return doc.toObject();
}

/** A deleted menu must not stay wired into the header or footer. */
export const forgetMenu = (id) =>
  SiteLayout.updateOne({ key: 'default' }, { $pull: { 'footer.menuIds': id }, $set: {} }).then(() =>
    SiteLayout.updateOne({ key: 'default', headerMenuId: id }, { $set: { headerMenuId: null } }),
  );
