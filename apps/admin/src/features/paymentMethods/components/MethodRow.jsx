import { fromMinor, PAYMENT_METHOD, paymentFee, toMinor } from '@supershop/shared';
import { FormField, MoneyInput, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Badge, Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useDeleteMethod, useUpdateMethod } from '../hooks';

/** A sample basket, so a percentage fee means something while you type it. */
const SAMPLE_BASKET = 20000;

/**
 * One payment method: switch it on or off, rename it for customers, charge for it, limit it to a
 * basket size, and move it up or down the checkout list. Built-in methods can be edited but not
 * deleted — checkout knows how to finish them and old orders name them.
 */
/** `note`: one line about this method in the section it is listed under (e.g. "also online"). */
export function MethodRow({ method, canEdit, first, last, onMove, note = null }) {
  const { t } = useTranslation();
  const update = useUpdateMethod();
  const remove = useDeleteMethod();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});

  // Money is typed in major units ("10.75") and converted once, on save.
  const edit = draft ?? {
    label: method.label?.en ?? '',
    instructions: method.instructions?.en ?? '',
    type: method.type ?? 'offline',
    feeFixed: fromMinor(method.fee?.fixed ?? 0),
    feePercent: String((method.fee?.bps ?? 0) / 100),
    minTotal: method.minTotal == null ? '' : fromMinor(method.minTotal),
    maxTotal: method.maxTotal == null ? '' : fromMinor(method.maxTotal),
  };
  const set = (patch) => setDraft({ ...edit, ...patch });

  /** Empty money field = "no limit"; anything unparseable is left to the server to reject. */
  const minor = (value, fallback = null) => {
    if (value === '' || value == null) return fallback;
    try {
      return toMinor(value);
    } catch {
      return fallback;
    }
  };
  const body = () => ({
    label: edit.label,
    instructions: edit.instructions,
    ...(method.builtIn ? {} : { type: edit.type }),
    fee: {
      fixed: minor(edit.feeFixed, 0),
      bps: Math.round(Number(edit.feePercent || 0) * 100),
    },
    minTotal: minor(edit.minTotal),
    maxTotal: minor(edit.maxTotal),
  });

  const save = async () => {
    setErrors({});
    try {
      await update.mutateAsync({ id: method.id, ...body() });
      setDraft(null);
    } catch (err) {
      if (err?.code === 'VALIDATION_ERROR')
        setErrors(Object.fromEntries((err.details ?? []).map((d) => [d.path, d.message])));
    }
  };

  const sampleFee = paymentFee(body().fee, SAMPLE_BASKET);

  return (
    <li className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-col">
          <button
            type="button"
            aria-label={t('payments.methods.moveUp')}
            disabled={!canEdit || first}
            onClick={() => onMove(method.id, -1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('payments.methods.moveDown')}
            disabled={!canEdit || last}
            onClick={() => onMove(method.id, 1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{method.label?.en ?? method.key}</span>
            <Badge variant="secondary">{t(`payments.methods.types.${method.type}`)}</Badge>
            {method.builtIn && <Badge variant="outline">{t('payments.methods.builtIn')}</Badge>}
            {note && <Badge tone="info">{note}</Badge>}
          </span>
          <span className="text-sm text-muted-foreground">{method.key}</span>
        </div>

        <Checkbox
          id={`enabled-${method.id}`}
          label={t('payments.methods.enabled')}
          checked={method.enabled}
          disabled={!canEdit || update.isPending}
          onChange={(e) => update.mutate({ id: method.id, enabled: e.target.checked })}
        />
        <button
          type="button"
          className="text-sm underline underline-offset-4"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? t('payments.methods.close') : t('payments.methods.edit')}
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t p-4">
          {!method.builtIn && (
            <FormField
              label={t('payments.methods.type', 'Method Type')}
              description={t(
                'payments.methods.typeHelp',
                'Choose MFS or offline/manual collection.',
              )}
              error={fieldMessage(t, errors.type)}
            >
              <Select
                value={edit.type}
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
          )}

          <FormField
            label={t('payments.methods.label')}
            description={t('payments.methods.labelHelp')}
            error={fieldMessage(t, errors.label)}
          >
            <PlainTextInput
              maxLength={PAYMENT_METHOD.LABEL_MAX}
              value={edit.label}
              disabled={!canEdit}
              onChange={(e) => set({ label: e.target.value })}
            />
          </FormField>
          <ArabicPreview label={t('payments.methods.arabicLabel')} value={method.label} />

          <FormField
            label={t('payments.methods.instructions')}
            description={t('payments.methods.instructionsHelp')}
            error={fieldMessage(t, errors.instructions)}
          >
            <PlainTextArea
              rows={2}
              maxLength={PAYMENT_METHOD.INSTRUCTIONS_MAX}
              value={edit.instructions}
              disabled={!canEdit}
              onChange={(e) => set({ instructions: e.target.value })}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('payments.methods.feeFixed')}
              error={fieldMessage(t, errors['fee.fixed'])}
            >
              <MoneyInput
                currency="SAR"
                value={edit.feeFixed}
                disabled={!canEdit}
                onChange={(e) => set({ feeFixed: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('payments.methods.feePercent')}
              description={t('payments.methods.feePercentHelp')}
              error={fieldMessage(t, errors['fee.bps'])}
            >
              <PlainTextInput
                inputMode="decimal"
                dir="ltr"
                maxLength={6}
                value={edit.feePercent}
                disabled={!canEdit}
                onChange={(e) => set({ feePercent: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('payments.methods.minTotal')}
              error={fieldMessage(t, errors.minTotal)}
            >
              <MoneyInput
                currency="SAR"
                value={edit.minTotal}
                disabled={!canEdit}
                onChange={(e) => set({ minTotal: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('payments.methods.maxTotal')}
              description={t('payments.methods.limitsHelp')}
              error={fieldMessage(t, errors.maxTotal)}
            >
              <MoneyInput
                currency="SAR"
                value={edit.maxTotal}
                disabled={!canEdit}
                onChange={(e) => set({ maxTotal: e.target.value })}
              />
            </FormField>
          </div>
          {sampleFee > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('payments.methods.feeExample', {
                basket: (SAMPLE_BASKET / 100).toFixed(2),
                fee: (sampleFee / 100).toFixed(2),
              })}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canEdit || update.isPending || !draft}
              onClick={save}
              className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {t('common.save')}
            </button>
            {draft && (
              <button
                type="button"
                className="h-10 rounded-md border px-5 text-sm"
                onClick={() => setDraft(null)}
              >
                {t('common.cancel')}
              </button>
            )}
            {!method.builtIn && (
              <button
                type="button"
                disabled={!canEdit || remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(t('payments.methods.confirmDelete', { name: method.label?.en }))
                  )
                    remove.mutate(method.id);
                }}
                className="ms-auto flex h-10 items-center gap-2 rounded-md border border-destructive/40 px-5 text-sm text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
