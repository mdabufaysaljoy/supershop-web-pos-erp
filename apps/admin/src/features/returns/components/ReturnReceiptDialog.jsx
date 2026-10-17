import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrintingStatus } from '@/features/printing/resource';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { usePrintReturnReceipt, useReturnDetail } from '../resource';

/**
 * View and thermally print a completed return credit note or exchange receipt (P6.6).
 */
export function ReturnReceiptDialog({ open, onOpenChange, returnId, initialRecord = null }) {
  const { t } = useTranslation();
  const detail = useReturnDetail(returnId, {
    enabled: Boolean(open && returnId && !initialRecord),
  });
  const printing = usePrintingStatus();
  const printReceipt = usePrintReturnReceipt();

  const record = initialRecord ?? detail.data;
  const isExchange = record?.type === 'exchange';
  const lines = record?.receiptLines ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        <div className="flex flex-wrap items-start justify-between gap-3 pe-6">
          <div className="grid gap-1">
            <DialogTitle>
              {isExchange
                ? t('returns.receipt.exchangeTitle', { number: record?.returnNo ?? '' })
                : t('returns.receipt.returnTitle', { number: record?.returnNo ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {t('returns.receipt.description', { orderNo: record?.orderNo ?? '' })}
            </DialogDescription>
          </div>
          {printing.data?.enabled && record?.id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printReceipt.isPending}
              onClick={() => printReceipt.mutate({ id: record.id })}
            >
              <Printer className="size-4" aria-hidden />
              {t('returns.receipt.print')}
            </Button>
          )}
        </div>

        {detail.isError && <Alert variant="destructive">{errorMessage(t, detail.error)}</Alert>}
        {!record && detail.isPending ? (
          <Skeleton className="h-64" />
        ) : record ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-3 content-start">
              <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">{t('returns.receipt.returnedItems')}</h3>
                {record.returnLines?.map((line, i) => (
                  <div
                    key={`${line.variantId}-${i}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="grid">
                      <span>
                        {fmt.number(line.qty)} × {line.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(`returns.disposition.${line.disposition}`)}
                      </span>
                    </div>
                    <span className="tabular-nums">-{fmt.money(line.lineTotal)}</span>
                  </div>
                ))}
                <Row
                  label={t('returns.fields.returnCredit')}
                  value={fmt.money(record.returnTotals?.total ?? 0)}
                  strong
                />
              </section>

              {isExchange && record.exchangeLines?.length > 0 && (
                <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                  <h3 className="font-semibold">{t('returns.receipt.exchangeItems')}</h3>
                  {record.exchangeLines.map((line, i) => (
                    <div
                      key={`${line.variantId}-${i}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {fmt.number(line.qty)} × {line.name}
                      </span>
                      <span className="tabular-nums">{fmt.money(line.lineTotal)}</span>
                    </div>
                  ))}
                  <Row
                    label={t('returns.fields.exchangeTotal')}
                    value={fmt.money(record.exchangeTotals?.total ?? 0)}
                    strong
                  />
                </section>
              )}

              <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
                <h3 className="font-semibold">{t('returns.receipt.settlementSection')}</h3>
                {isExchange ? (
                  <>
                    <Row
                      label={t('returns.fields.differenceDue')}
                      value={fmt.money(record.differenceDue ?? 0)}
                      strong
                    />
                    {record.payments?.map((p, idx) => (
                      <Row key={idx} label={p.label ?? p.method} value={fmt.money(p.amount)} />
                    ))}
                    {record.changeGiven > 0 && (
                      <Row
                        label={t('returns.fields.changeGiven')}
                        value={fmt.money(record.changeGiven)}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Row
                      label={t('returns.fields.refundAmount')}
                      value={fmt.money(record.refundAmount ?? 0)}
                      strong
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {t('returns.fields.refundMethod')}
                      </span>
                      <Badge tone="neutral">
                        {t(`returns.refundMethod.${record.refundMethod ?? 'cash'}`)}
                      </Badge>
                    </div>
                  </>
                )}
              </section>
            </div>

            <section className="grid gap-2 content-start">
              <h3 className="text-sm font-semibold">{t('returns.receipt.thermalPreview')}</h3>
              <pre
                dir="ltr"
                className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
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
