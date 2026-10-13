import {
  createPurchaseOrderSchemas,
  fromMinor,
  PERMISSIONS as P,
  PURCHASE,
  PURCHASE_TRANSITIONS,
  toMinor,
} from '@supershop/shared';
import {
  FormField,
  inputClass,
  IntegerInput,
  MoneyInput,
  PlainTextArea,
  PlainTextInput,
  useFieldControlProps,
} from '@supershop/ui';
import { ArrowLeft, PackageCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { branches } from '@/features/branches/resource';
import { Select } from '@/features/settings/components/controls';
import { suppliers } from '@/features/suppliers/resource';
import { fmt } from '@/lib/format';
import { errorMessage, fieldMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { issuesToDetails } from '@/lib/resource';
import { ReceiveDialog } from '../components/ReceiveDialog';
import { VariantPicker } from '../components/VariantPicker';
import { purchaseOrders, usePurchaseOrder, usePurchaseOrderAction } from '../resource';
import { optionLabel, PO_STATUS_TONE } from '../status';

const schemas = createPurchaseOrderSchemas();

const initialForm = (po) => ({
  supplierId: po?.supplier.id ?? '',
  branchId: po?.branch?.id ?? '',
  expectedAt: po?.expectedAt ?? '',
  reference: po?.reference ?? '',
  note: po?.note ?? '',
  lines: (po?.lines ?? []).map((l) => ({
    variantId: l.variantId,
    variant: l.variant,
    qty: String(l.qtyOrdered),
    unitCost: fromMinor(l.unitCost),
    qtyReceived: l.qtyReceived,
  })),
});

/** "12.50" → 1250; invalid input passes through so the schema flags the field. */
const toMoney = (v) => {
  try {
    return toMinor(v);
  } catch {
    return v;
  }
};
/** Line total in halalas for display (0 while the row is incomplete). */
const lineTotal = (l) => {
  const cost = toMoney(l.unitCost);
  const qty = Number(l.qty);
  return Number.isSafeInteger(cost) && Number.isSafeInteger(qty) ? cost * qty : 0;
};
/** Native date picker wired to its FormField label/error. */
function DateInput(props) {
  return (
    <input type="date" dir="ltr" className={inputClass} {...useFieldControlProps()} {...props} />
  );
}

const toErrors = (details = []) => Object.fromEntries(details.map((d) => [d.path, d.message]));

/** Create / view / edit one purchase order; status actions and receiving live here too. */
export function PurchaseOrderEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: po, isPending, isError, error } = usePurchaseOrder(id);
  if (id && isPending) return <Skeleton className="h-96" />;
  if (id && isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  // Remount on save so the form shows what the server stored.
  return <Editor key={po ? `${po.id}:${po.updatedAt}` : 'new'} po={po ?? null} />;
}

function Editor({ po }) {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const create = purchaseOrders.useCreate();
  const update = purchaseOrders.useUpdate();
  const action = usePurchaseOrderAction(po?.id);
  const { data: supplierList } = suppliers.useList({ limit: 100, sort: 'name' });
  const { data: branchList } = branches.useList({});
  const [form, setForm] = useState(() => initialForm(po));
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'close' | 'cancel'

  const isNew = !po;
  const status = po?.status ?? 'draft';
  const canManage = can(P.PURCHASE_MANAGE);
  const editable = canManage && PURCHASE_TRANSITIONS.edit.includes(status);
  const headerLocked = !isNew && status !== 'draft'; // supplier fixed once ordered
  const busy = create.isPending || update.isPending || action.isPending;
  const err = (path) => fieldMessage(t, errors[path]);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setLine = (i, patch) =>
    set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const body = () => ({
    supplierId: form.supplierId,
    branchId: form.branchId,
    expectedAt: form.expectedAt || null,
    reference: form.reference,
    note: form.note,
    lines: form.lines.map((l) => ({
      variantId: l.variantId,
      qty: l.qty === '' ? undefined : Number(l.qty),
      unitCost: l.unitCost === '' ? undefined : toMoney(l.unitCost),
    })),
  });

  /** Validates with the shared schema and saves; returns the saved order or null. */
  const save = async () => {
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body());
    if (!parsed.success) {
      setErrors(toErrors(issuesToDetails(parsed.error.issues)));
      return null;
    }
    setErrors({});
    try {
      const saved = isNew
        ? await create.mutateAsync(parsed.data)
        : await update.mutateAsync({ id: po.id, body: parsed.data });
      setDirty(false);
      if (isNew) navigate(`/purchase-orders/${saved.id}`, { replace: true });
      return saved;
    } catch (e) {
      setErrors(toErrors(e?.details));
      return null;
    }
  };

  const placeOrder = async () => {
    if (dirty && !(await save())) return;
    await action.mutateAsync({ action: 'order' }).catch((e) => setErrors(toErrors(e?.details)));
  };
  const runConfirmed = async () => {
    await action.mutateAsync({ action: confirm }).catch(() => {});
    setConfirm(null);
  };

  const suppliersToShow = (supplierList?.data ?? []).filter(
    (s) => s.isActive || s.id === form.supplierId,
  );
  const added = new Set(form.lines.map((l) => l.variantId));
  const total = form.lines.reduce((sum, l) => sum + lineTotal(l), 0);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link
            to="/purchase-orders"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('purchaseOrders.title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {isNew ? t('purchaseOrders.newTitle') : po.poNo}
            {!isNew && (
              <Badge tone={PO_STATUS_TONE[status]}>{t(`purchaseOrders.status.${status}`)}</Badge>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={save} disabled={busy || (!isNew && !dirty)}>
              {t(isNew ? 'purchaseOrders.saveDraft' : 'common.save')}
            </Button>
          )}
          {!isNew && canManage && PURCHASE_TRANSITIONS.order.includes(status) && (
            <Button variant="outline" onClick={placeOrder} disabled={busy}>
              {t('purchaseOrders.actions.order')}
            </Button>
          )}
          {!isNew && can(P.INVENTORY_RECEIVE) && PURCHASE_TRANSITIONS.receive.includes(status) && (
            <Button variant="outline" onClick={() => setReceiving(true)} disabled={busy || dirty}>
              <PackageCheck className="size-4" aria-hidden />
              {t('purchaseOrders.actions.receive')}
            </Button>
          )}
          {!isNew && canManage && PURCHASE_TRANSITIONS.close.includes(status) && (
            <Button variant="ghost" onClick={() => setConfirm('close')} disabled={busy}>
              {t('purchaseOrders.actions.close')}
            </Button>
          )}
          {!isNew &&
            canManage &&
            PURCHASE_TRANSITIONS.cancel.includes(status) &&
            !po.lines.some((l) => l.qtyReceived > 0) && (
              <Button variant="ghost" onClick={() => setConfirm('cancel')} disabled={busy}>
                {t('purchaseOrders.actions.cancel')}
              </Button>
            )}
        </div>
      </header>

      {confirm && (
        <Alert className="flex flex-wrap items-center gap-3">
          <span className="flex-1">{t(`purchaseOrders.confirm.${confirm}`)}</span>
          <Button size="sm" variant="destructive" onClick={runConfirmed} disabled={busy}>
            {t(`purchaseOrders.actions.${confirm}`)}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
            {t('common.cancel')}
          </Button>
        </Alert>
      )}
      {err('status') && <Alert variant="destructive">{err('status')}</Alert>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={t('purchaseOrders.form.supplier')} error={err('supplierId')} required>
          <Select
            value={form.supplierId}
            disabled={!editable || headerLocked}
            onChange={(e) => set({ supplierId: e.target.value })}
          >
            <option value="">{t('purchaseOrders.form.choose')}</option>
            {!suppliersToShow.some((s) => s.id === form.supplierId) && po && (
              <option value={po.supplier.id}>{po.supplier.name}</option>
            )}
            {suppliersToShow.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('purchaseOrders.form.branch')} error={err('branchId')} required>
          <Select
            value={form.branchId}
            disabled={!editable || (po?.totals.unitsReceived ?? 0) > 0}
            onChange={(e) => set({ branchId: e.target.value })}
          >
            <option value="">{t('purchaseOrders.form.choose')}</option>
            {(branchList?.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name.en}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('purchaseOrders.form.expectedAt')} error={err('expectedAt')}>
          <DateInput
            value={form.expectedAt}
            disabled={!editable}
            onChange={(e) => set({ expectedAt: e.target.value })}
          />
        </FormField>
        <FormField label={t('purchaseOrders.form.reference')} error={err('reference')}>
          <PlainTextInput
            maxLength={PURCHASE.REFERENCE_MAX}
            value={form.reference}
            disabled={!editable}
            onChange={(e) => set({ reference: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('purchaseOrders.form.note')}
          error={err('note')}
          className="sm:col-span-2"
        >
          <PlainTextArea
            rows={2}
            maxLength={PURCHASE.NOTE_MAX}
            value={form.note}
            disabled={!editable}
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
      </section>

      <section className="grid gap-3" aria-label={t('purchaseOrders.lines.title')}>
        <h2 className="text-lg font-medium">{t('purchaseOrders.lines.title')}</h2>
        {err('lines') && <Alert variant="destructive">{err('lines')}</Alert>}
        {form.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('purchaseOrders.lines.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseOrders.lines.item')}</TableHead>
                  <TableHead className="w-28">{t('purchaseOrders.lines.qty')}</TableHead>
                  <TableHead className="w-36">{t('purchaseOrders.lines.unitCost')}</TableHead>
                  <TableHead className="text-end">{t('purchaseOrders.lines.total')}</TableHead>
                  {!isNew && <TableHead>{t('purchaseOrders.received')}</TableHead>}
                  {editable && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {form.lines.map((l, i) => (
                  <TableRow key={l.variantId}>
                    <TableCell>
                      <span className="grid">
                        <span className="text-sm">
                          {l.variant?.productName?.en}
                          {optionLabel(l.variant) && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {optionLabel(l.variant)}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {l.variant?.sku}
                        </span>
                        {err(`lines.${i}.variantId`) && (
                          <span className="text-xs text-destructive">
                            {err(`lines.${i}.variantId`)}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <IntegerInput
                        aria-label={t('purchaseOrders.lines.qtyFor', { sku: l.variant?.sku })}
                        aria-invalid={err(`lines.${i}.qty`) ? true : undefined}
                        title={err(`lines.${i}.qty`)}
                        maxLength={6}
                        value={l.qty}
                        disabled={!editable}
                        onChange={(e) => setLine(i, { qty: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        aria-label={t('purchaseOrders.lines.costFor', { sku: l.variant?.sku })}
                        aria-invalid={err(`lines.${i}.unitCost`) ? true : undefined}
                        title={err(`lines.${i}.unitCost`)}
                        value={l.unitCost}
                        disabled={!editable || l.qtyReceived > 0}
                        onChange={(e) => setLine(i, { unitCost: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {fmt.money(lineTotal(l))}
                    </TableCell>
                    {!isNew && (
                      <TableCell className="tabular-nums">
                        {t('purchaseOrders.unitsOf', {
                          received: l.qtyReceived,
                          total: Number(l.qty) || 0,
                        })}
                      </TableCell>
                    )}
                    {editable && (
                      <TableCell>
                        {l.qtyReceived === 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('purchaseOrders.lines.remove', { sku: l.variant?.sku })}
                            onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>{t('purchaseOrders.totalExVat')}</TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {fmt.money(total)}
                  </TableCell>
                  {!isNew && <TableCell />}
                  {editable && <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        {editable && form.lines.length < PURCHASE.MAX_LINES && (
          <VariantPicker
            excludeIds={added}
            onAdd={(v) =>
              set({
                lines: [
                  ...form.lines,
                  {
                    variantId: v.id,
                    variant: v,
                    qty: '1',
                    unitCost: v.cost != null ? fromMinor(v.cost) : '',
                    qtyReceived: 0,
                  },
                ],
              })
            }
          />
        )}
      </section>

      {po?.receipts?.length > 0 && (
        <section className="grid gap-2" aria-label={t('purchaseOrders.receipts.title')}>
          <h2 className="text-lg font-medium">{t('purchaseOrders.receipts.title')}</h2>
          <ul className="grid gap-1 text-sm">
            {po.receipts.map((r) => (
              <li key={r.operationId} className="flex flex-wrap gap-x-3">
                <span className="font-mono" dir="ltr">
                  {r.docNo}
                </span>
                <span>{fmt.dateTime(r.at)}</span>
                <span>{t('purchaseOrders.receipts.units', { count: r.units })}</span>
                <span className="tabular-nums">{fmt.money(r.value)}</span>
                {r.reference && <span className="text-muted-foreground">{r.reference}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {po && <ReceiveDialog order={po} open={receiving} onOpenChange={setReceiving} />}
    </div>
  );
}
