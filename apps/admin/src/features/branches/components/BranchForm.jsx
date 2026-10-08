import { BRANCH, createBranchSchemas } from '@supershop/shared';
import {
  CodeInput,
  EmailInput,
  FormField,
  IntegerInput,
  PhoneInput,
  PlainTextInput,
  SanitizedInput,
} from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions } from '@/components/FormActions';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { branches } from '../resource';

const schemas = createBranchSchemas();
const TEXT_FIELDS = ['code', 'name', 'phone', 'email'];
/** Saudi National Address parts: [key, input, maxLength]. */
const ADDRESS_FIELDS = [
  ['buildingNumber', 'digits', 4],
  ['street', 'text', 120],
  ['district', 'text', 80],
  ['city', 'text', 60],
  ['postalCode', 'digits', 5],
  ['additionalNumber', 'digits', 4],
  ['shortAddress', 'code', 8],
];
const FLAGS = ['isActive', 'fulfillsOnlineOrders', 'pickupEnabled'];
/** Coordinates: digits, one leading minus, one dot. */
const sanitizeCoordinate = (v) =>
  String(v ?? '')
    .replace(/[^\d.-]/g, '')
    .replace(/(?!^)-/g, '')
    .replace(/(\..*)\./g, '$1');

const initialForm = (b) => ({
  ...Object.fromEntries(
    TEXT_FIELDS.map((k) => [k, k === 'name' ? (b?.name?.en ?? '') : (b?.[k] ?? '')]),
  ),
  type: b?.type ?? 'store',
  address: Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [k, b?.address?.[k] ?? ''])),
  lat: b?.location ? String(b.location.lat) : '',
  lng: b?.location ? String(b.location.lng) : '',
  isActive: b?.isActive ?? true,
  fulfillsOnlineOrders: b?.fulfillsOnlineOrders ?? false,
  pickupEnabled: b?.pickupEnabled ?? false,
});

/** Both coordinates or neither; anything else is left to the schema to reject. */
function toLocation(lat, lng) {
  if (lat.trim() === '' && lng.trim() === '') return null;
  const num = (v) => (v.trim() === '' ? undefined : Number(v)); // a blank half → "required"
  return { lat: num(lat), lng: num(lng) };
}

/**
 * Create/edit a branch. Empty optional fields are cleared. `canDelete`: only staff covering all
 * branches may create or delete branches (the server enforces it too).
 */
export function BranchForm({ branch, canDelete, onDone }) {
  const { t } = useTranslation();
  const create = branches.useCreate();
  const update = branches.useUpdate();
  const remove = branches.useRemove();
  const [form, setForm] = useState(() => initialForm(branch));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !branch;
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });
  const addressField = (key) => ({
    value: form.address[key],
    onChange: (e) => setForm({ ...form, address: { ...form.address, [key]: e.target.value } }),
  });
  const err = (key) => fieldMessage(t, errors[key]);

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k]])),
      type: form.type,
      address: form.address,
      location: toLocation(form.lat, form.lng),
      ...Object.fromEntries(FLAGS.map((k) => [k, form[k]])),
    };
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body);
    const toErrors = (details) =>
      detailsToErrors(details, {
        ...Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [`address.${k}`, `address.${k}`])),
        'location.lat': 'lat',
        'location.lng': 'lng',
        location: 'lat',
      });
    if (!parsed.success) return setErrors(toErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: branch.id, body: parsed.data });
      onDone();
    } catch (error) {
      setErrors(toErrors(error?.details));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <FormField
          label={t('branches.form.code')}
          description={t('branches.form.codeHint')}
          error={err('code')}
          required
        >
          <CodeInput maxLength={12} {...field('code')} />
        </FormField>
        <FormField
          label={t('branches.form.name')}
          description={t('branches.form.nameHint')}
          error={err('name')}
          required
        >
          <PlainTextInput maxLength={BRANCH.NAME_MAX} {...field('name')} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('branches.form.type')} error={err('type')}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {BRANCH.TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`branches.types.${type}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('branches.form.phone')} error={err('phone')}>
          <PhoneInput {...field('phone')} />
        </FormField>
        <FormField label={t('branches.form.email')} error={err('email')}>
          <EmailInput {...field('email')} />
        </FormField>
      </div>

      <fieldset className="grid gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t('branches.form.address')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {ADDRESS_FIELDS.map(([key, kind, max]) => {
            const Input =
              kind === 'digits' ? IntegerInput : kind === 'code' ? CodeInput : PlainTextInput;
            return (
              <FormField
                key={key}
                label={t(`branches.address.${key}`)}
                error={err(`address.${key}`)}
              >
                <Input maxLength={max} {...addressField(key)} />
              </FormField>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('branches.form.lat')} error={err('lat')}>
          <SanitizedInput
            type="text"
            inputMode="decimal"
            dir="ltr"
            maxLength={12}
            sanitize={sanitizeCoordinate}
            {...field('lat')}
          />
        </FormField>
        <FormField label={t('branches.form.lng')} error={err('lng')}>
          <SanitizedInput
            type="text"
            inputMode="decimal"
            dir="ltr"
            maxLength={12}
            sanitize={sanitizeCoordinate}
            {...field('lng')}
          />
        </FormField>
      </div>

      <div className="grid gap-3">
        {FLAGS.map((k) => (
          <Checkbox
            key={k}
            id={`branch-${k}`}
            label={t(`branches.form.${k}`)}
            description={t(`branches.form.${k}Hint`)}
            checked={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
          />
        ))}
      </div>
      <FormActions
        isNew={isNew}
        canDelete={canDelete}
        busy={create.isPending || update.isPending}
        confirmDelete={confirmDelete}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={() => remove.mutate(branch.id, { onSuccess: onDone })}
        deleting={remove.isPending}
        onCancel={onDone}
      />
    </form>
  );
}
