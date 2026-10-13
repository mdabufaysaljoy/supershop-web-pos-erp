import { GlossaryTerm, Language, Translation, UiStringOverride } from './i18n.model.js';

// ---------- languages ----------
export const listLanguages = () => Language.find().sort({ order: 1, code: 1 }).lean();
export const insertLanguageIfMissing = (lang) =>
  Language.updateOne({ code: lang.code }, { $setOnInsert: lang }, { upsert: true });

// ---------- translation cache ----------
export const findCachedTranslations = (keys) =>
  Translation.find({ key: { $in: keys } }, { key: 1, text: 1 }).lean();

/** Inserts cache rows; concurrent duplicates are ignored. */
export async function insertCachedTranslations(rows) {
  if (!rows.length) return;
  try {
    await Translation.insertMany(rows, { ordered: false });
  } catch (err) {
    if (!(err?.code === 11000 || err?.writeErrors?.every((e) => e.code === 11000))) throw err;
  }
}

// ---------- glossary ----------
export const listGlossaryTerms = () => GlossaryTerm.find().lean();
export const insertGlossaryTermIfMissing = (t) =>
  GlossaryTerm.updateOne(
    { termKey: t.term.toLowerCase() },
    { $setOnInsert: { ...t, termKey: t.term.toLowerCase() } },
    { upsert: true },
  );

export const findGlossaryTerm = (id) => GlossaryTerm.findById(id).lean();
export const findGlossaryByTermKey = (termKey) => GlossaryTerm.findOne({ termKey }).lean();
export const createGlossaryTerm = (data) =>
  GlossaryTerm.create({ ...data, termKey: data.term.toLowerCase() }).then((d) => d.toObject());
export const updateGlossaryTerm = (id, patch) =>
  GlossaryTerm.findByIdAndUpdate(
    id,
    { $set: { ...patch, ...(patch.term ? { termKey: patch.term.toLowerCase() } : {}) } },
    { returnDocument: 'after', lean: true },
  );
export const deleteGlossaryTerm = (id) => GlossaryTerm.findByIdAndDelete(id).lean();

// ---------- UI string overrides ----------
export const listUiOverrides = (catalog, lang) =>
  UiStringOverride.find({ catalog, lang }).sort({ key: 1 }).lean();
export const findUiOverride = (catalog, lang, key) =>
  UiStringOverride.findOne({ catalog, lang, key }).lean();
export const upsertUiOverride = ({ catalog, lang, key, value, srcHash, updatedBy }) =>
  UiStringOverride.findOneAndUpdate(
    { catalog, lang, key },
    { $set: { value, srcHash, updatedBy } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
export const deleteUiOverride = (catalog, lang, key) =>
  UiStringOverride.findOneAndDelete({ catalog, lang, key }).lean();
