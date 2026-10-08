import mongoose from 'mongoose';

const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] ?? mongoose.model(name, schema);

/** Enabled site languages (config, not code — CLAUDE.md §5.7). English is the source. */
const languageSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, match: /^[a-z]{2}(-[A-Z]{2})?$/ },
    name: { type: String, required: true }, // English name, e.g. "Arabic"
    nativeName: { type: String, required: true }, // endonym, e.g. shown in the switcher (data, not UI copy)
    rtl: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    isSource: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { collection: 'languages', timestamps: true },
);

/** Machine-translation cache: one row per (from, to, glossaryVersion, source text). */
const translationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // sha256(from|to|glossaryVersion|text)
    from: { type: String, required: true },
    to: { type: String, required: true },
    source: { type: String, required: true },
    text: { type: String, required: true },
    provider: { type: String, required: true },
    glossaryVersion: { type: Number, required: true },
  },
  { collection: 'translations', timestamps: true },
);

/**
 * Glossary (set once by admins): `doNotTranslate` terms are kept verbatim (brands, payment
 * methods); otherwise `targets[lang]` is the preferred translation of `term`.
 */
const glossarySchema = new Schema(
  {
    term: { type: String, required: true, trim: true, maxlength: 100 },
    termKey: { type: String, required: true, unique: true }, // lower-cased term
    doNotTranslate: { type: Boolean, default: false },
    targets: { type: Map, of: String, default: {} },
  },
  { collection: 'glossary_terms', timestamps: true },
);

export const Language = model('Language', languageSchema);
export const Translation = model('Translation', translationSchema);
export const GlossaryTerm = model('GlossaryTerm', glossarySchema);
