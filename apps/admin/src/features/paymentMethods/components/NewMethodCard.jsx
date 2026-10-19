import { PAYMENT_METHOD, validators } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { Smartphone, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useCreateMethod } from '../hooks';

/**
 * A method the shop collects by itself — MFS (bKash, Nagad, STC Pay, Urpay), bank transfer,
 * pay at the branch, or a digital wallet. Checkout and POS show it with its instructions.
 */
const EMPTY = { key: '', label: '', instructions: '', type: 'offline' };

const MFS_PRESETS = [
  {
    name: 'bKash',
    type: 'mfs',
    key: 'bkash',
    label: 'bKash',
    instructions: 'Send money to merchant wallet or scan QR code. Enter transaction ID.',
  },
  {
    name: 'Nagad',
    type: 'mfs',
    key: 'nagad',
    label: 'Nagad',
    instructions: 'Send money to merchant wallet or scan QR code. Enter transaction ID.',
  },
  {
    name: 'Rocket',
    type: 'mfs',
    key: 'rocket',
    label: 'Rocket',
    instructions: 'Send money to merchant wallet or scan QR code. Enter transaction ID.',
  },
  {
    name: 'STC Pay',
    type: 'mfs',
    key: 'stc-pay',
    label: 'STC Pay',
    instructions:
      'Transfer to STC Pay merchant mobile number or scan QR code. Enter transaction ID.',
  },
  {
    name: 'Urpay',
    type: 'mfs',
    key: 'urpay',
    label: 'Urpay',
    instructions: 'Transfer to Urpay merchant number or scan QR code. Enter transaction ID.',
  },
  {
    name: 'MFS Wallet',
    type: 'mfs',
    key: 'mfs',
    label: 'MFS / Mobile Wallet',
    instructions: 'Pay via mobile financial service or digital wallet. Enter transaction ID.',
  },
];

export function NewMethodCard({ canEdit }) {
  const { t } = useTranslation();
  const create = useCreateMethod();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const applyPreset = (preset) => {
    set({
      type: preset.type,
      key: preset.key,
      label: preset.label,
      instructions: preset.instructions,
    });
  };

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
      <CardContent className="grid gap-5">
        {/* Quick MFS Presets */}
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3.5 grid gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Smartphone className="size-3.5" />
            <span>
              {t('payments.methods.presets.title', 'Quick MFS Presets for POS & Walk-in Customers')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MFS_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                disabled={!canEdit}
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                <Wallet className="size-3 text-primary/70" />
                <span>+ {preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <FormField
            label={t('payments.methods.type', 'Method Type')}
            description={t('payments.methods.typeHelp', 'Choose MFS or offline/manual collection.')}
            error={fieldMessage(t, errors.type)}
          >
            <Select
              value={form.type}
              disabled={!canEdit}
              onChange={(e) => set({ type: e.target.value })}
            >
              <option value="mfs">
                {t(
                  'payments.methods.types.mfs',
                  'MFS (Mobile Financial Services / Digital Wallet)',
                )}
              </option>
              <option value="offline">
                {t(
                  'payments.methods.types.offline',
                  'Collected by you (Bank Transfer, Counter, Offline)',
                )}
              </option>
            </Select>
          </FormField>

          <FormField
            label={t('payments.methods.label')}
            error={fieldMessage(t, errors.label)}
            required
          >
            <PlainTextInput
              maxLength={PAYMENT_METHOD.LABEL_MAX}
              placeholder="e.g. bKash, Nagad, STC Pay, Bank Transfer"
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
              placeholder={validators.toSlug(form.label) || 'bkash'}
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
              placeholder="Payment instructions, merchant mobile number or QR details for customers..."
              value={form.instructions}
              disabled={!canEdit}
              onChange={(e) => set({ instructions: e.target.value })}
            />
          </FormField>

          <div className="sm:col-span-2 flex items-center justify-between pt-1">
            <button
              type="submit"
              disabled={!canEdit || create.isPending || !form.label}
              className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 transition-colors"
            >
              {create.isPending ? t('common.saving') : t('payments.methods.add')}
            </button>
            <span className="text-xs text-muted-foreground">
              Available for POS walk-in sales & online checkout
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
