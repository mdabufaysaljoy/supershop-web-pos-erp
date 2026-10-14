import { PAYMENT_METHOD, validators } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldMessage } from '@/lib/i18n';
import { useCreateMethod } from '../hooks';

/**
 * A method the shop collects by itself — bank transfer, pay at the branch, a wallet it settles
 * manually. Checkout shows it with its instructions and records the order as awaiting payment.
 */
const EMPTY = { key: '', label: '', instructions: '' };

export function NewMethodCard({ canEdit }) {
  const { t } = useTranslation();
  const create = useCreateMethod();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    const key = form.key || validators.toSlug(form.label);
    try {
      await create.mutateAsync({ ...form, key });
      setForm(EMPTY);
    } catch (err) {
      if (err?.code === 'VALIDATION_ERROR')
        setErrors(Object.fromEntries((err.details ?? []).map((d) => [d.path, d.message])));
      if (err?.code === 'CONFLICT') setErrors({ key: 'validation.duplicate' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('payments.methods.addTitle')}</h2>
        </CardTitle>
        <CardDescription>{t('payments.methods.addDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <FormField
            label={t('payments.methods.label')}
            error={fieldMessage(t, errors.label)}
            required
          >
            <PlainTextInput
              maxLength={PAYMENT_METHOD.LABEL_MAX}
              value={form.label}
              disabled={!canEdit}
              onChange={(e) => set({ label: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('payments.methods.key')}
            description={t('payments.methods.keyHelp')}
            error={fieldMessage(t, errors.key)}
          >
            <PlainTextInput
              dir="ltr"
              maxLength={60}
              placeholder={validators.toSlug(form.label) || 'bank-transfer'}
              value={form.key}
              disabled={!canEdit}
              onChange={(e) => set({ key: e.target.value })}
            />
          </FormField>
          <FormField
            className="sm:col-span-2"
            label={t('payments.methods.instructions')}
            description={t('payments.methods.instructionsHelp')}
            error={fieldMessage(t, errors.instructions)}
          >
            <PlainTextArea
              rows={2}
              maxLength={PAYMENT_METHOD.INSTRUCTIONS_MAX}
              value={form.instructions}
              disabled={!canEdit}
              onChange={(e) => set({ instructions: e.target.value })}
            />
          </FormField>
          <button
            type="submit"
            disabled={!canEdit || create.isPending || !form.label}
            className="h-10 justify-self-start rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            {create.isPending ? t('common.saving') : t('payments.methods.add')}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
