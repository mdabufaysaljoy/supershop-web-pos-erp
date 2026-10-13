import { z } from 'zod';
import { V } from '../validators/messages.js';
import { objectId, plainText } from '../validators/fields.js';

/**
 * Custom field definitions (CLAUDE.md §2.4): admin-defined extra fields for an entity, stored in
 * the DB and rendered dynamically. Labels/placeholders/help/option labels are English source and
 * auto-translated; entered VALUES are data and never translated (use `select` for values that
 * must appear in Arabic — their option labels are translated).
 */
export const CUSTOM_FIELD = Object.freeze({
  ENTITIES: Object.freeze(['product', 'customer', 'checkout']),
  TYPES: Object.freeze(['text', 'textarea', 'number', 'boolean', 'select', 'multiselect', 'date']),
  VISIBILITY: Object.freeze(['admin', 'public']),
  MAX_OPTIONS: 50,
  MAX_PER_ENTITY: 50,
  TEXT_MAX: 500,
  TEXTAREA_MAX: 5000,
});

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const fieldKey = z
  .string({ error: V.INVALID_TYPE })
  .trim()
  .regex(KEY_RE, { error: V.CODE_INVALID });
const hasOptions = (type) => type === 'select' || type === 'multiselect';
const finite = z.number({ error: V.INVALID_TYPE }).finite({ error: V.INVALID_TYPE });

/** Cross-field rules shared by create and update (on the merged definition). */
export function customFieldDefIssues(def) {
  const issues = [];
  const optionCount = def.options?.length ?? 0;
  if (hasOptions(def.type) && optionCount === 0)
    issues.push({ path: ['options'], message: V.REQUIRED });
  if (!hasOptions(def.type) && optionCount > 0)
    issues.push({ path: ['options'], message: V.INVALID_TYPE });
  const keys = (def.options ?? []).map((o) => o.key);
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) issues.push({ path: ['options', i, 'key'], message: V.DUPLICATE });
  });
  if (def.min != null && def.max != null && def.min > def.max) {
    issues.push({ path: ['max'], message: V.INVALID_TYPE });
  }
  if ((def.min != null || def.max != null) && !['text', 'textarea', 'number'].includes(def.type)) {
    issues.push({ path: ['min'], message: V.INVALID_TYPE });
  }
  return issues;
}

const addIssues = (issues, ctx) =>
  issues.forEach((i) => ctx.addIssue({ code: 'custom', path: i.path, message: i.message }));

export function createCustomFieldSchemas() {
  const option = z.object({ key: fieldKey, label: plainText({ min: 1, max: 80 }) });
  const editable = {
    label: plainText({ min: 1, max: 80 }),
    placeholder: plainText({ max: 120 }).optional(),
    helpText: plainText({ max: 300 }).optional(),
    required: z.boolean({ error: V.INVALID_TYPE }).optional(),
    options: z.array(option).max(CUSTOM_FIELD.MAX_OPTIONS, { error: V.TOO_LONG }).optional(),
    /** text/textarea: length bounds; number: value bounds. */
    min: finite.nullable().optional(),
    max: finite.nullable().optional(),
    visibility: z.enum(CUSTOM_FIELD.VISIBILITY, { error: V.INVALID_TYPE }).optional(),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
  };
  return {
    idParam: z.object({ id: objectId }),
    listQuery: z.object({ entity: z.enum(CUSTOM_FIELD.ENTITIES, { error: V.INVALID_TYPE }) }),
    create: z
      .object({
        entity: z.enum(CUSTOM_FIELD.ENTITIES, { error: V.INVALID_TYPE }),
        key: fieldKey,
        type: z.enum(CUSTOM_FIELD.TYPES, { error: V.INVALID_TYPE }),
        ...editable,
      })
      .superRefine((def, ctx) => addIssues(customFieldDefIssues(def), ctx)),
    /** entity, key and type are immutable (stored values depend on them). */
    update: z
      .object({ ...editable, label: editable.label.optional() })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
  };
}

/** Zod schema for ONE value of a definition (`{ type, required, options, min, max }`). */
function valueSchema(def) {
  let s;
  switch (def.type) {
    case 'text':
    case 'textarea': {
      const cap = def.type === 'text' ? CUSTOM_FIELD.TEXT_MAX : CUSTOM_FIELD.TEXTAREA_MAX;
      const max = Math.min(def.max ?? cap, cap);
      s = plainText({ min: Math.max(def.min ?? 0, def.required ? 1 : 0), max });
      break;
    }
    case 'number': {
      s = finite;
      if (def.min != null) s = s.min(def.min, { error: V.TOO_SHORT });
      if (def.max != null) s = s.max(def.max, { error: V.TOO_LONG });
      break;
    }
    case 'boolean':
      s = z.boolean({ error: V.INVALID_TYPE });
      break;
    case 'date':
      s = z.iso.date({ error: V.INVALID_TYPE });
      break;
    case 'select':
      s = z.enum(
        def.options.map((o) => o.key),
        { error: V.INVALID_TYPE },
      );
      break;
    case 'multiselect':
      // De-duplicate first, then bound by the number of choices.
      s = z.preprocess(
        (v) => (Array.isArray(v) ? [...new Set(v)] : v),
        z
          .array(
            z.enum(
              def.options.map((o) => o.key),
              { error: V.INVALID_TYPE },
            ),
            { error: V.INVALID_TYPE },
          )
          .max(def.options.length, { error: V.TOO_LONG })
          .refine((v) => !def.required || v.length > 0, { error: V.REQUIRED }),
      );
      break;
    default:
      s = z.never();
  }
  return def.required ? s : s.nullable().optional();
}

/**
 * Schema for an entity's custom values `{ [key]: value }` built from its ACTIVE definitions.
 * Unknown keys are dropped. Same function in the API and the admin/storefront forms.
 * @param {{ key: string, type: string, required?: boolean, options?: { key: string }[],
 *   min?: number | null, max?: number | null }[]} defs
 */
export const customValuesSchema = (defs) =>
  z.object(Object.fromEntries(defs.map((d) => [d.key, valueSchema(d)])));
