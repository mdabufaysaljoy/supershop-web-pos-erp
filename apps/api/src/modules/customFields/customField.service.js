import {
  CUSTOM_FIELD,
  customFieldDefIssues,
  customValuesSchema,
  EVENTS,
  SOURCE_LANGUAGE,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  zodIssuesToDetails,
} from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { resolveDoc } from '../i18n/index.js';
import * as repo from './customField.repo.js';

/**
 * Custom field definitions + value validation for entities (product now; customer/checkout later).
 * Other modules call `validateCustomValues(entity, values)` and `publicCustomValues(...)`.
 */

const LOCALIZED = ['label', 'placeholder', 'helpText', 'options.*.label'];
const en = (text) => ({ [SOURCE_LANGUAGE]: text ?? '' });
const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
const auditView = (d) => ({
  label: d.label?.en ?? '',
  type: d.type,
  required: d.required,
  visibility: d.visibility,
  isActive: d.isActive,
  options: d.options?.map((o) => o.key) ?? [],
});

/** Admin DTO (full LocalizedStrings). */
export const toDefDto = (d) => ({
  id: String(d._id),
  entity: d.entity,
  key: d.key,
  type: d.type,
  label: d.label ?? en(''),
  placeholder: d.placeholder ?? en(''),
  helpText: d.helpText ?? en(''),
  options: (d.options ?? []).map((o) => ({ key: o.key, label: o.label ?? en('') })),
  required: d.required,
  min: d.min ?? null,
  max: d.max ?? null,
  visibility: d.visibility,
  position: d.position,
  isActive: d.isActive,
  updatedAt: d.updatedAt,
});

export const listDefinitions = async (entity) => (await repo.listForEntity(entity)).map(toDefDto);

/** Plain definitions (English) as the shared value schema expects them. */
const asRuleDefs = (defs) =>
  defs.filter((d) => d.isActive).map((d) => ({ ...d, options: d.options ?? [] }));

/**
 * Validates `values` against the entity's ACTIVE definitions; unknown/inactive keys are dropped.
 * `previous` (stored values) keeps values of inactive fields so disabling a field loses no data.
 * Throws ValidationError with paths `customFields.<key>`.
 */
export async function validateCustomValues(entity, values = {}, previous = {}) {
  const defs = await repo.listForEntity(entity);
  const parsed = customValuesSchema(asRuleDefs(defs)).safeParse(values ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      zodIssuesToDetails(parsed.error.issues).map((d) => ({
        ...d,
        path: `customFields.${d.path}`,
      })),
    );
  }
  const kept = Object.fromEntries(
    defs
      .filter((d) => !d.isActive && previous?.[d.key] !== undefined)
      .map((d) => [d.key, previous[d.key]]),
  );
  const clean = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  return { ...kept, ...clean };
}

/**
 * Storefront view of stored values: only active PUBLIC fields, labels in `lang`, select values
 * shown by their (translated) option label. Returns `[{ key, label, value }]` in field order.
 */
export async function publicCustomValues(entity, values = {}, lang) {
  const defs = await repo.listForEntity(entity);
  const out = [];
  for (const def of defs) {
    if (!def.isActive || def.visibility !== 'public') continue;
    const raw = values?.[def.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const r = resolveDoc(def, LOCALIZED, lang);
    const optionLabel = (k) => r.options.find((o) => o.key === k)?.label ?? k;
    const value =
      def.type === 'select'
        ? optionLabel(raw)
        : def.type === 'multiselect'
          ? raw.map(optionLabel)
          : raw;
    out.push({ key: def.key, type: def.type, label: r.label, value });
  }
  return out;
}

export async function createDefinition(actor, input) {
  if ((await repo.countForEntity(input.entity)) >= CUSTOM_FIELD.MAX_PER_ENTITY) {
    throw new ValidationError([{ path: 'key', message: V.TOO_LONG }]);
  }
  if (await repo.keyExists(input.entity, input.key)) {
    throw new ConflictError('Key already used', [{ path: 'key', message: V.DUPLICATE }]);
  }
  const position = await repo.countForEntity(input.entity);
  const created = await repo.createDef({
    entity: input.entity,
    key: input.key,
    type: input.type,
    label: en(input.label),
    placeholder: en(input.placeholder),
    helpText: en(input.helpText),
    options: (input.options ?? []).map((o) => ({ key: o.key, label: en(o.label) })),
    required: input.required ?? false,
    min: input.min ?? null,
    max: input.max ?? null,
    visibility: input.visibility ?? 'admin',
    position,
    isActive: input.isActive ?? true,
  });
  emit(actor, EVENTS.CUSTOM_FIELD_CREATED, {
    fieldId: String(created._id),
    entity: created.entity,
    key: created.key,
    after: auditView(created),
  });
  return toDefDto(created);
}

/**
 * Edits labels/rules. Options are matched by key: existing keys keep their translations, removed
 * keys disappear from choices (stored values remain until edited).
 */
export async function updateDefinition(actor, id, input) {
  const doc = await repo.loadForUpdate(id);
  if (!doc) throw new NotFoundError('Custom field not found');
  const merged = { ...doc.toObject(), ...input };
  const issues = customFieldDefIssues({
    ...merged,
    options: input.options ?? doc.toObject().options,
  });
  if (issues.length) {
    throw new ValidationError(issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const before = auditView(doc.toObject());
  for (const k of ['label', 'placeholder', 'helpText']) {
    if (input[k] !== undefined) doc.set(`${k}.${SOURCE_LANGUAGE}`, input[k]);
  }
  for (const k of ['required', 'min', 'max', 'visibility', 'isActive']) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  if (input.options !== undefined) {
    const existing = new Map(doc.options.map((o) => [o.key, o.toObject()]));
    doc.options = input.options.map((o) => {
      const prev = existing.get(o.key);
      return prev
        ? { ...prev, label: { ...prev.label, [SOURCE_LANGUAGE]: o.label } }
        : { key: o.key, label: en(o.label) };
    });
  }
  const saved = await repo.saveDoc(doc);
  emit(actor, EVENTS.CUSTOM_FIELD_UPDATED, {
    fieldId: id,
    entity: saved.entity,
    key: saved.key,
    before,
    after: auditView(saved),
  });
  return toDefDto(saved);
}

/** Soft delete: the key stays reserved; stored values are ignored from now on. */
export async function deleteDefinition(actor, id) {
  const d = await repo.softDelete(id);
  if (!d) throw new NotFoundError('Custom field not found');
  emit(actor, EVENTS.CUSTOM_FIELD_DELETED, { fieldId: id, entity: d.entity, key: d.key });
}
