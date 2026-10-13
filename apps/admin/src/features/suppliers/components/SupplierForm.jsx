import { createSupplierSchemas, SUPPLIER } from '@supershop/shared';
import {
  AddressInput,
  CodeInput,
  EmailInput,
  FormField,
  IntegerInput,
  NameInput,
  PhoneInput,
  PlainTextArea,
  PlainTextInput,
} from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions } from '@/components/FormActions';
import { Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { suppliers } from '../resource';

const schemas = createSupplierSchemas();
const TEXT_FIELDS = [
  'name',
  'contactName',
  'phone',
  'email',
  'address',
  'taxNumber',
  'registrationNumber',
  'notes',
];

const initialForm = (s) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, s?.[k] ?? ''])),
  paymentTermsDays: String(s?.paymentTermsDays ?? 0),
  isActive: s?.isActive ?? true,
});

/** Create/edit a supplier. Empty optional fields are cleared (sent as ''). */
export function SupplierForm({ supplier, onDone }) {
  const { t } = useTranslation();
  const create = suppliers.useCreate();
  const update = suppliers.useUpdate();
  const remove = suppliers.useRemove();
  const [form, setForm] = useState(() => initialForm(supplier));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !supplier;
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });
  const err = (key) => fieldMessage(t, errors[key]);

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k]])),
      paymentTermsDays: Number(form.paymentTermsDays || 0),
      isActive: form.isActive,
    };
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body);
    if (!parsed.success) return setErrors(detailsToErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: supplier.id, body: parsed.data });
      onDone();
    } catch (error) {
      setErrors(detailsToErrors(error?.details));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <FormField label={t('suppliers.form.name')} error={err('name')} required>
        <PlainTextInput maxLength={SUPPLIER.NAME_MAX} {...field('name')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('suppliers.form.contactName')} error={err('contactName')}>
          <NameInput {...field('contactName')} />
        </FormField>
        <FormField
          label={t('suppliers.form.phone')}
          description={t('suppliers.form.phoneHint')}
          error={err('phone')}
        >
          <PhoneInput {...field('phone')} />
        </FormField>
        <FormField label={t('suppliers.form.email')} error={err('email')}>
          <EmailInput {...field('email')} />
        </FormField>
        <FormField label={t('suppliers.form.paymentTerms')} error={err('paymentTermsDays')}>
          <IntegerInput maxLength={3} {...field('paymentTermsDays')} />
        </FormField>
        <FormField label={t('suppliers.form.taxNumber')} error={err('taxNumber')}>
          <CodeInput maxLength={24} {...field('taxNumber')} />
        </FormField>
        <FormField label={t('suppliers.form.registrationNumber')} error={err('registrationNumber')}>
          <CodeInput maxLength={24} {...field('registrationNumber')} />
        </FormField>
      </div>
      <FormField label={t('suppliers.form.address')} error={err('address')}>
        <AddressInput {...field('address')} />
      </FormField>
      <FormField label={t('suppliers.form.notes')} error={err('notes')}>
        <PlainTextArea rows={3} maxLength={SUPPLIER.NOTES_MAX} {...field('notes')} />
      </FormField>
      <Checkbox
        id="supplier-active"
        label={t('suppliers.form.active')}
        checked={form.isActive}
        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
      />
      <FormActions
        isNew={isNew}
        busy={create.isPending || update.isPending}
        confirmDelete={confirmDelete}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={() => remove.mutate(supplier.id, { onSuccess: onDone })}
        deleting={remove.isPending}
        onCancel={onDone}
      />
    </form>
  );
}
