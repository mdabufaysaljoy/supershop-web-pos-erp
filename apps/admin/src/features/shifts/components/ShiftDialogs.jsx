import { MoneyInput, PlainTextInput } from '@supershop/ui';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/features/settings/components/controls';
import { usePrintingStatus } from '@/features/printing/resource';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import {
  useCloseShift,
  useOpenShift,
  usePrintShiftReport,
  useRecordCashMovement,
  useShiftXReport,
  useShiftZReport,
} from '../resource';

const toHalalas = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/** Open a new till shift with a counted opening cash float. */
export function OpenShiftDialog({ open, onOpenChange, branchId, onOpened }) {
  const { t } = useTranslation();
  const [openingCash, setOpeningCash] = useState('');
  const [note, setNote] = useState('');
  const openShift = useOpenShift();

  const submit = async (e) => {
    e.preventDefault();
    if (!branchId) return;
    const shift = await openShift
      .mutateAsync({
        branchId,
        openingCash: toHalalas(openingCash),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      .catch(() => null);
    if (!shift) return;
    setOpeningCash('');
    setNote('');
    onOpenChange(false);
    onOpened?.(shift);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogTitle>{t('shifts.open.title')}</DialogTitle>
        <DialogDescription>{t('shifts.open.description')}</DialogDescription>
        {openShift.isError && (
          <Alert variant="destructive">{errorMessage(t, openShift.error)}</Alert>
        )}
        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1 text-sm">
            {t('shifts.open.openingCash')}
            <MoneyInput
              value={openingCash}
              placeholder="0.00"
              onChange={(e) => setOpeningCash(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('shifts.open.note')}
            <PlainTextInput
              value={note}
              maxLength={240}
              placeholder={t('shifts.open.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={openShift.isPending || !branchId}>
              {openShift.isPending ? t('common.saving') : t('shifts.open.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Record paid-in or paid-out cash in the active drawer. */
export function CashMovementDialog({ open, onOpenChange, shift, initialType = 'in' }) {
  const { t } = useTranslation();
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const record = useRecordCashMovement();
  const halalas = toHalalas(amount);

  const submit = async (e) => {
    e.preventDefault();
    if (!shift?.id || halalas <= 0 || !reason.trim()) return;
    const updated = await record
      .mutateAsync({
        id: shift.id,
        body: { type, amount: halalas, reason: reason.trim() },
      })
      .catch(() => null);
    if (!updated) return;
    setAmount('');
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogTitle>{t('shifts.movement.title')}</DialogTitle>
        <DialogDescription>{t('shifts.movement.description')}</DialogDescription>
        {record.isError && <Alert variant="destructive">{errorMessage(t, record.error)}</Alert>}
        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1 text-sm">
            {t('shifts.movement.type')}
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="in">{t('shifts.movement.types.in')}</option>
              <option value="out">{t('shifts.movement.types.out')}</option>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            {t('shifts.movement.amount')}
            <MoneyInput
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('shifts.movement.reason')}
            <PlainTextInput
              value={reason}
              maxLength={240}
              placeholder={t('shifts.movement.reasonPlaceholder')}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={record.isPending || halalas <= 0 || reason.trim().length === 0}
            >
              {record.isPending ? t('common.saving') : t('shifts.movement.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Count the drawer, preview any over/short discrepancy, and close the shift to issue a Z-report. */
export function CloseShiftDialog({ open, onOpenChange, shift, onClosed }) {
  const { t } = useTranslation();
  const [closingCash, setClosingCash] = useState('');
  const [note, setNote] = useState('');
  const closeShift = useCloseShift();

  const expected = shift?.summary?.expectedCash ?? shift?.expectedCash ?? 0;
  const counted = closingCash === '' ? expected : toHalalas(closingCash);
  const discrepancy = counted - expected;

  const submit = async (e) => {
    e.preventDefault();
    if (!shift?.id) return;
    const res = await closeShift
      .mutateAsync({
        id: shift.id,
        body: {
          closingCash: counted,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      })
      .catch(() => null);
    if (!res) return;
    setClosingCash('');
    setNote('');
    onOpenChange(false);
    onClosed?.(res);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogTitle>{t('shifts.close.title')}</DialogTitle>
        <DialogDescription>{t('shifts.close.description')}</DialogDescription>
        {closeShift.isError && (
          <Alert variant="destructive">{errorMessage(t, closeShift.error)}</Alert>
        )}
        <form onSubmit={submit} className="grid gap-4">
          <dl className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <dt>{t('shifts.fields.openingCash')}</dt>
              <dd className="tabular-nums">{fmt.money(shift?.openingCash ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('shifts.fields.cashSales')}</dt>
              <dd className="tabular-nums">{fmt.money(shift?.summary?.cashSales ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('shifts.fields.cashIn')}</dt>
              <dd className="tabular-nums">{fmt.money(shift?.summary?.cashIn ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('shifts.fields.cashOut')}</dt>
              <dd className="tabular-nums">{fmt.money(shift?.summary?.cashOut ?? 0)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>{t('shifts.fields.expectedCash')}</dt>
              <dd className="tabular-nums">{fmt.money(expected)}</dd>
            </div>
          </dl>

          <label className="grid gap-1 text-sm">
            {t('shifts.close.closingCash')}
            <MoneyInput
              value={closingCash}
              placeholder={(expected / 100).toFixed(2)}
              onChange={(e) => setClosingCash(e.target.value)}
            />
          </label>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{t('shifts.fields.discrepancy')}</span>
            <Badge
              tone={discrepancy === 0 ? 'success' : discrepancy > 0 ? 'warning' : 'danger'}
              className="tabular-nums"
            >
              {discrepancy > 0 ? `+${fmt.money(discrepancy)}` : fmt.money(discrepancy)}
            </Badge>
          </div>

          <label className="grid gap-1 text-sm">
            {t('shifts.close.note')}
            <PlainTextInput
              value={note}
              maxLength={240}
              placeholder={t('shifts.close.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={closeShift.isPending}>
              {closeShift.isPending ? t('common.saving') : t('shifts.close.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** View and thermally print an X-report (live snapshot) or Z-report (immutable end-of-shift). */
export function ShiftReportDialog({ open, onOpenChange, shiftId, kind = 'x' }) {
  const { t } = useTranslation();
  const isZ = kind === 'z';
  const xQuery = useShiftXReport(shiftId, { enabled: open && !isZ });
  const zQuery = useShiftZReport(shiftId, { enabled: open && isZ });
  const query = isZ ? zQuery : xQuery;
  const printing = usePrintingStatus();
  const printReport = usePrintShiftReport();

  const shift = query.data?.shift;
  const zReport = query.data?.zReport;
  const summary = zReport?.summary ?? query.data?.summary ?? shift?.summary;
  const lines = query.data?.lines ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        <div className="flex flex-wrap items-start justify-between gap-3 pe-6">
          <div className="grid gap-1">
            <DialogTitle>
              {isZ
                ? t('shifts.report.zTitle', { number: zReport?.reportNo ?? shift?.zReportNo ?? '' })
                : t('shifts.report.xTitle', { number: shift?.shiftNo ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {isZ ? t('shifts.report.zDescription') : t('shifts.report.xDescription')}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={query.isPending}
              onClick={() => window.print()}
            >
              <Printer className="size-4" aria-hidden />
              {t('shifts.report.browserPrint', 'Print')}
            </Button>
            {printing.data?.enabled && shiftId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={printReport.isPending || query.isPending}
                onClick={() => printReport.mutate({ id: shiftId, kind })}
              >
                <Printer className="size-4" aria-hidden />
                {t('shifts.report.print')}
              </Button>
            )}
          </div>
        </div>

        {query.isError && <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>}
        {query.isPending ? (
          <Skeleton className="h-64" />
        ) : summary ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-4 content-start">
              <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">{t('shifts.report.salesSection')}</h3>
                <Row
                  label={t('shifts.fields.ordersCount')}
                  value={fmt.number(summary.sales?.count ?? 0)}
                />
                <Row
                  label={t('shifts.fields.itemsCount')}
                  value={fmt.number(summary.sales?.itemCount ?? 0)}
                />
                <Row
                  label={t('shifts.fields.subtotal')}
                  value={fmt.money(summary.sales?.subtotal ?? 0)}
                />
                <Row
                  label={t('shifts.fields.discounts')}
                  value={fmt.money(summary.sales?.discountTotal ?? 0)}
                />
                <Row label={t('shifts.fields.vat')} value={fmt.money(summary.sales?.vat ?? 0)} />
                <Row
                  label={t('shifts.fields.totalSales')}
                  value={fmt.money(summary.sales?.total ?? 0)}
                  strong
                />
              </section>

              <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">{t('shifts.report.drawerSection')}</h3>
                <Row
                  label={t('shifts.fields.openingCash')}
                  value={fmt.money(summary.openingCash ?? 0)}
                />
                <Row
                  label={t('shifts.fields.cashSales')}
                  value={fmt.money(summary.cashSales ?? 0)}
                />
                <Row label={t('shifts.fields.cashIn')} value={fmt.money(summary.cashIn ?? 0)} />
                <Row label={t('shifts.fields.cashOut')} value={fmt.money(summary.cashOut ?? 0)} />
                <Row
                  label={t('shifts.fields.expectedCash')}
                  value={fmt.money(summary.expectedCash ?? 0)}
                  strong
                />
                {isZ && (
                  <>
                    <Row
                      label={t('shifts.fields.closingCash')}
                      value={fmt.money(summary.closingCash ?? 0)}
                    />
                    <Row
                      label={t('shifts.fields.discrepancy')}
                      value={fmt.money(summary.discrepancy ?? 0)}
                      strong
                    />
                  </>
                )}
              </section>

              {summary.byMethod?.length > 0 && (
                <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                  <h3 className="font-semibold">{t('shifts.report.tendersSection')}</h3>
                  {summary.byMethod.map((m, idx) => (
                    <Row
                      key={m.method || idx}
                      label={`${(m.label || m.method || 'OTHER').toUpperCase()} (${fmt.number(m.count ?? 0)})`}
                      value={fmt.money(m.netAmount ?? m.amount ?? m.tendered ?? 0)}
                    />
                  ))}
                </section>
              )}
            </div>

            <section id="shift-report-printable" className="grid gap-2 content-start">
              <h3 className="text-sm font-semibold print:hidden">
                {t('shifts.report.thermalPreview')}
              </h3>
              <pre
                dir="ltr"
                className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed print:max-h-none print:border-none print:bg-white print:p-0 print:text-black"
              >
                {lines.join('\n')}
              </pre>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'border-t pt-1 font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
