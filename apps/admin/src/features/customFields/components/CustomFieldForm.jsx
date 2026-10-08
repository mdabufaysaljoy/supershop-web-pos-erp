import { CUSTOM_FIELD, createCustomFieldSchemas, validators } from '@supershop/shared';
import { FormField, PlainTextInput, SanitizedInput } from '@supershop/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions } from '@/components/FormActions';
import { Button } from '@/components/ui/button';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { customFields } from '../resource';

const schemas = createCustomFieldSchemas();
const hasOptions = (type) => type === 'select' || type === 'multiselect';
const hasBounds = (type) => ['text', 'textarea', 'number'].includes(type);
/** Field/option keys: lower-case letter first, then a–z, 0–9, `_` (max 40). */
const sanitizeKey = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40);
const keyFrom = (label) => sanitizeKey(validators.toSlug(label).replace(/-/g, '_'));
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

const initialForm = (d) => ({
  key: d?.key ?? '',
  type: d?.type ?? 'text',
  label: d?.label?.en ?? '',
  placeholder: d?.placeholder?.en ?? '',
  helpText: d?.helpText?.en ?? '',
  required: d?.required ?? false,
  visibility: d?.visibility ?? 'admin',
  min: d?.min == null ? '' : String(d.min),
  max: d?.max == null ? '' : String(d.max),
  isActive: d?.isActive ?? true,
  options: (d?.options ?? []).map((o) => ({ key: o.key, label: o.label.en, saved: true })),
});

/** Create/edit a custom field. Entity, key and type can't change after creation. */
export function CustomFieldForm({ entity, def, onDone }) {
  const { t } = useTranslation();
  const create = customFields.useCreate();
  const update = customFields.useUpdate();
  const remove = customFields.useRemove();
  const [form, setForm] = useState(() => initialForm(def));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !def;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (k) => fieldMessage(t, errors[k]);

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      label: form.label,
      placeholder: form.placeholder,
      helpText: form.helpText,
      required: form.required,
      visibility: form.visibility,
      isActive: form.isActive,
      ...(hasBounds(form.type) && { min: numOrNull(form.min), max: numOrNull(form.max) }),
      ...(hasOptions(form.type) && {
        options: form.options.map((o) => ({ key: o.key || keyFrom(o.label), label: o.label })),
      }),
    };
    const full = isNew
      ? { entity, key: form.key || keyFrom(form.label), type: form.type, ...body }
      : body;
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(full);
    if (!parsed.success) return setErrors(detailsToErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: def.id, body: parsed.data });
      onDone();
    } catch (error) {
      setErrors(detailsToErrors(error?.details));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('customFields.form.label')} error={err('label')} required>
          <PlainTextInput value={form.label} maxLength={80} onChange={set('label')} />
        </FormField>
        <FormField
          label={t('customFields.form.key')}
          description={t(isNew ? 'customFields.form.keyHint' : 'customFields.form.keyLocked')}
          error={err('key')}
        >
          <SanitizedInput
            dir="ltr"
            sanitize={sanitizeKey}
            value={form.key}
            placeholder={isNew ? keyFrom(form.label) : undefined}
            disabled={!isNew}
            onChange={set('key')}
          />
        </FormField>
        <FormField label={t('customFields.form.type')} error={err('type')}>
          <Select value={form.type} disabled={!isNew} onChange={set('type')}>
            {CUSTOM_FIELD.TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`customFields.types.${type}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('customFields.form.visibility')} error={err('visibility')}>
          <Select value={form.visibility} onChange={set('visibility')}>
            <option value="admin">{t('customFields.visibility.admin')}</option>
            <option value="public">{t('customFields.visibility.public')}</option>
          </Select>
        </FormField>
        {form.type !== 'boolean' && form.type !== 'date' && (
          <FormField label={t('customFields.form.placeholder')} error={err('placeholder')}>
            <PlainTextInput
              value={form.placeholder}
              maxLength={120}
              onChange={set('placeholder')}
            />
          </FormField>
        )}
        <FormField label={t('customFields.form.helpText')} error={err('helpText')}>
          <PlainTextInput value={form.helpText} maxLength={300} onChange={set('helpText')} />
        </FormField>
        {hasBounds(form.type) && (
          <>
            <FormField
              label={t(
                form.type === 'number'
                  ? 'customFields.form.minValue'
                  : 'customFields.form.minLength',
              )}
              error={err('min')}
            >
              <SanitizedInput
                dir="ltr"
                inputMode="decimal"
                sanitize={(v) => v.replace(/[^\d.-]/g, '')}
                value={form.min}
                onChange={set('min')}
              />
            </FormField>
            <FormField
              label={t(
                form.type === 'number'
                  ? 'customFields.form.maxValue'
                  : 'customFields.form.maxLength',
              )}
              error={err('max')}
            >
              <SanitizedInput
                dir="ltr"
                inputMode="decimal"
                sanitize={(v) => v.replace(/[^\d.-]/g, '')}
                value={form.max}
                onChange={set('max')}
              />
            </FormField>
          </>
        )}
      </div>

      {hasOptions(form.type) && (
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{t('customFields.form.options')}</legend>
          {form.options.map((o, i) => (
            <div key={o.saved ? o.key : `new-${i}`} className="flex items-center gap-2">
              <PlainTextInput
                value={o.label}
                maxLength={80}
                aria-label={t('customFields.form.optionLabel', { n: i + 1 })}
                aria-invalid={
                  errors[`options.${i}.key`] || errors[`options.${i}.label`] ? true : undefined
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    options: form.options.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <code className="w-32 shrink-0 truncate text-xs text-muted-foreground" dir="ltr">
                {o.key || keyFrom(o.label)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('customFields.form.removeOption', { label: o.label })}
                onClick={() =>
                  setForm({ ...form, options: form.options.filter((_, j) => j !== i) })
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={form.options.length >= CUSTOM_FIELD.MAX_OPTIONS}
              onClick={() =>
                setForm({ ...form, options: [...form.options, { key: '', label: '' }] })
              }
            >
              <Plus className="size-4" aria-hidden />
              {t('customFields.form.addOption')}
            </Button>
          </div>
          {err('options') && <p className="text-sm text-destructive">{err('options')}</p>}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-6">
        <Checkbox
          id="cf-required"
          label={t('customFields.form.required')}
          checked={form.required}
          onChange={(e) => setForm({ ...form, required: e.target.checked })}
        />
        <Checkbox
          id="cf-active"
          label={t('customFields.form.active')}
          description={t('customFields.form.activeHint')}
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
      </div>

      <FormActions
        isNew={isNew}
        busy={create.isPending || update.isPending}
        confirmDelete={confirmDelete}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={() => remove.mutate(def.id, { onSuccess: onDone })}
        deleting={remove.isPending}
        onCancel={onDone}
      />
    </form>
  );
}
