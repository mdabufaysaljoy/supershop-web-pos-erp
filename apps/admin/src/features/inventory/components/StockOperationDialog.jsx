import {
  createInventorySchemas,
  fromMinor,
  normalizeDigits,
  STOCK,
  toMinor,
} from '@supershop/shared';
import {
  FormField,
  IntegerInput,
  MoneyInput,
  PlainTextArea,
  PlainTextInput,
  SanitizedInput,
} from '@supershop/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VariantLabel, VariantPicker } from '@/components/VariantPicker';
import { Select } from '@/features/settings/components/controls';
import { suppliers } from '@/features/suppliers/resource';
import { fieldMessage } from '@/lib/i18n';
import { issuesToDetails } from '@/lib/resource';
import { useStockOperation, useVariantLevels } from '../resource';

const schemas = createInventorySchemas();
/** Reasons offered for a manual change (a count has its own mode). */
const ADJUST_REASONS = STOCK.ADJUST_REASONS.filter((r) => r !== 'count');
/** The quantity field each mode sends per line. */
const LINE_FIELD = { adjust: 'delta', count: 'counted', transfer: 'qty', receive: 'qty' };

/** Signed whole number for adjustments: optional leading minus, digits (Arabic digits OK). */
const sanitizeSigned = (v) => {
  const s = normalizeDigits(String(v ?? ''));
  return (s.trim().startsWith('-') ? '-' : '') + s.replace(/\D/g, '');
};
const toMoney = (v) => {
  try {
    return toMinor(v);
  } catch {
    return v;
  }
};
const num = (v) => (v === '' || v === '-' ? undefined : Number(v));

/**
 * Books one stock document: `adjust` (± with a reason), `count` (counted quantities; the
 * difference is booked), `transfer` (between branches) or `receive` (goods without a PO).
 * `initial` = { branchId?, variant? } to start from a stock row.
 */
export function StockOperationDialog({ mode, open, onOpenChange, branchOptions, initial }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('common.close')}
        aria-describedby={undefined}
        className="max-w-2xl"
      >
        <DialogTitle className="pe-8">{t(`inventory.modes.${mode}.title`)}</DialogTitle>
        {open && (
          <OperationForm
            mode={mode}
            branchOptions={branchOptions}
            initial={initial}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OperationForm({ mode, branchOptions, initial, onDone }) {
  const { t } = useTranslation();
  const operation = useStockOperation(mode);
  const [key] = useState(() => crypto.randomUUID()); // one booking per opened dialog
  const singleBranch = branchOptions.length === 1 ? branchOptions[0].id : '';
  const [form, setForm] = useState(() => ({
    branchId: initial?.branchId ?? singleBranch,
    toBranchId: '',
    reason: mode === 'count' ? 'count' : 'damaged',
    note: '',
    reference: '',
    supplierId: '',
    lines: initial?.variant
      ? [{ variant: initial.variant, value: '', unitCost: costOf(initial.variant) }]
      : [],
  }));
  const [errors, setErrors] = useState({});
  const supplierList = suppliers.useList(
    { limit: 100, sort: 'name' },
    { enabled: mode === 'receive' },
  );
  const field = LINE_FIELD[mode];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (i, patch) =>
    set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const err = (path) => fieldMessage(t, errors[path]?.message);

  const body = () => {
    const lines = form.lines.map((l) => ({
      variantId: l.variant.id,
      [field]: num(l.value),
      ...(mode === 'receive' && l.unitCost !== '' && { unitCost: toMoney(l.unitCost) }),
    }));
    const note = form.note || undefined;
    if (mode === 'transfer')
      return { fromBranchId: form.branchId, toBranchId: form.toBranchId, note, lines };
    if (mode === 'receive')
      return {
        branchId: form.branchId,
        supplierId: form.supplierId || undefined,
        reference: form.reference || undefined,
        note,
        lines,
      };
    return { branchId: form.branchId, reason: form.reason, note, lines };
  };

  /** zod / API details → `{ path: { message, available? } }`; a count's line error sits on `delta`. */
  const toErrors = (details = []) =>
    Object.fromEntries(
      details.map((d) => [mode === 'count' ? d.path.replace(/\.delta$/, '.counted') : d.path, d]),
    );

  const submit = async () => {
    const schema = schemas[mode === 'count' ? 'adjust' : mode];
    const parsed = schema.safeParse(body());
    if (!parsed.success) return setErrors(toErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      await operation.mutateAsync({ body: parsed.data, idempotencyKey: key });
      onDone();
    } catch (error) {
      setErrors(toErrors(error?.details));
    }
  };

  const branchSelect = (name, label, exclude) => (
    <FormField
      label={label}
      error={err(name === 'branchId' && mode === 'transfer' ? 'fromBranchId' : name)}
      required
    >
      <Select value={form[name]} onChange={(e) => set({ [name]: e.target.value })}>
        <option value="">{t('inventory.chooseBranch')}</option>
        {branchOptions
          .filter((b) => b.id !== exclude)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name.en}
            </option>
          ))}
      </Select>
    </FormField>
  );

  return (
    // Not a <form>: the item picker inside has its own search form (forms can't nest).
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t(`inventory.modes.${mode}.help`)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {branchSelect(
          'branchId',
          t(mode === 'transfer' ? 'inventory.fromBranch' : 'inventory.branch'),
        )}
        {mode === 'transfer' && branchSelect('toBranchId', t('inventory.toBranch'), form.branchId)}
        {mode === 'adjust' && (
          <FormField label={t('inventory.reason')} error={err('reason')} required>
            <Select value={form.reason} onChange={(e) => set({ reason: e.target.value })}>
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`inventory.reasons.${r}`)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {mode === 'receive' && (
          <>
            {!supplierList.isError && (
              <FormField label={t('inventory.supplier')} error={err('supplierId')}>
                <Select
                  value={form.supplierId}
                  onChange={(e) => set({ supplierId: e.target.value })}
                >
                  <option value="">{t('inventory.noSupplier')}</option>
                  {(supplierList.data?.data ?? [])
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </FormField>
            )}
            <FormField label={t('inventory.reference')} error={err('reference')}>
              <PlainTextInput
                maxLength={STOCK.REFERENCE_MAX}
                value={form.reference}
                onChange={(e) => set({ reference: e.target.value })}
              />
            </FormField>
          </>
        )}
      </div>

      <section className="grid gap-2" aria-label={t('inventory.items')}>
        <h3 className="text-sm font-medium">{t('inventory.items')}</h3>
        {err('lines') && <p className="text-sm text-destructive">{err('lines')}</p>}
        {form.lines.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('inventory.noItems')}</p>
        )}
        <ul className="grid gap-2">
          {form.lines.map((l, i) => (
            <LineRow
              key={l.variant.id}
              mode={mode}
              line={l}
              branchId={form.branchId}
              error={errors[`lines.${i}.${field}`] ?? errors[`lines.${i}.variantId`]}
              costError={err(`lines.${i}.unitCost`)}
              onChange={(patch) => setLine(i, patch)}
              onRemove={() => set({ lines: form.lines.filter((_, j) => j !== i) })}
            />
          ))}
        </ul>
        {form.lines.length < STOCK.MAX_LINES && (
          <VariantPicker
            excludeIds={new Set(form.lines.map((l) => l.variant.id))}
            onAdd={(v) =>
              set({ lines: [...form.lines, { variant: v, value: '', unitCost: costOf(v) }] })
            }
          />
        )}
      </section>

      <FormField label={t('inventory.note')} error={err('note')}>
        <PlainTextArea
          rows={2}
          maxLength={STOCK.NOTE_MAX}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </FormField>
      {errors.status && <Alert variant="destructive">{err('status')}</Alert>}
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={operation.isPending}>
          {t(`inventory.modes.${mode}.submit`)}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Variant cost (only present with product.viewCost) as the default receipt cost. */
const costOf = (v) => (v?.cost != null ? fromMinor(v.cost) : '');

/** One item: current stock in the chosen branch, the quantity, and (count) the difference. */
function LineRow({ mode, line, branchId, error, costError, onChange, onRemove }) {
  const { t } = useTranslation();
  const levels = useVariantLevels(line.variant.id);
  const onHand = branchId
    ? (levels.data?.find((l) => l.branch?.id === branchId)?.onHand ?? 0)
    : null;
  const label = t(`inventory.modes.${mode}.lineLabel`, { sku: line.variant.sku });
  const message = error
    ? error.available != null
      ? t('inventory.onlyAvailable', { count: error.available })
      : fieldMessage(t, error.message)
    : undefined;
  const diff =
    mode === 'count' && line.value !== '' && onHand != null ? Number(line.value) - onHand : null;

  return (
    <li className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_8rem_auto] sm:items-start">
      <div className="grid gap-1">
        <VariantLabel variant={line.variant} />
        {onHand != null && (
          <span className="text-xs text-muted-foreground">
            {t('inventory.onHandNow', { count: onHand })}
            {diff != null && diff !== 0 && (
              <span className={diff > 0 ? 'text-emerald-700' : 'text-destructive'}>
                {' '}
                ({diff > 0 ? `+${diff}` : diff})
              </span>
            )}
          </span>
        )}
      </div>
      <div className="grid gap-1">
        {mode === 'adjust' ? (
          <SanitizedInput
            type="text"
            inputMode="numeric"
            dir="ltr"
            maxLength={8}
            sanitize={sanitizeSigned}
            aria-label={label}
            aria-invalid={message ? true : undefined}
            placeholder="-1"
            value={line.value}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        ) : (
          <IntegerInput
            maxLength={7}
            aria-label={label}
            aria-invalid={message ? true : undefined}
            value={line.value}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        )}
        {mode === 'receive' && (
          <MoneyInput
            aria-label={t('inventory.unitCostFor', { sku: line.variant.sku })}
            aria-invalid={costError ? true : undefined}
            placeholder={t('inventory.unitCost')}
            value={line.unitCost}
            onChange={(e) => onChange({ unitCost: e.target.value })}
          />
        )}
        {message && <span className="text-xs text-destructive">{message}</span>}
        {costError && <span className="text-xs text-destructive">{costError}</span>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('inventory.removeItem', { sku: line.variant.sku })}
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
