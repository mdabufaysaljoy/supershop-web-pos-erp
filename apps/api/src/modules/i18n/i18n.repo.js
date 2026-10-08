import { GlossaryTerm, Language, Translation } from './i18n.model.js';

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
