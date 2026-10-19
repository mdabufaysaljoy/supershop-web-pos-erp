import { QrCode } from '@supershop/ui';
import { ExternalLink, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { usePrintingStatus, usePrintReceipt } from '@/features/printing/resource';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';

/**
 * Modern POS Receipt Dialog matching exact physical thermal layout:
 * 1. Big store name on top
 * 2. Store address
 * 3. Contact details (phone & VAT registration)
 * 4. Printing date, time & receipt number
 * 5. Cashier name
 * 6. Customer name (if attached)
 * 7. Product items & pricing
 * 8. Calculation & payment info (subtotal, discount, VAT, total, tenders, change)
 * 9. Dynamic online sales verification QR code
 * 10. Thank you message
 */
export function PosReceiptDialog({ open, onOpenChange, order, cashierName, branchName }) {
  const { t } = useTranslation();
  const printing = usePrintingStatus();
  const printReceipt = usePrintReceipt();
  const generalSettings = useSettings('general');
  const taxSettings = useSettings('tax');

  if (!order) return null;

  const shopName =
    generalSettings.data?.find((s) => s.key === 'store.name')?.value ||
    order.shop?.name ||
    'Supershop';
  const shopAddress =
    generalSettings.data?.find((s) => s.key === 'store.address')?.value ||
    order.shop?.address ||
    'Riyadh, Saudi Arabia';
  const shopPhone =
    generalSettings.data?.find((s) => s.key === 'store.phone')?.value ||
    order.shop?.phone ||
    '+966 50 000 0000';
  const vatNumber =
    taxSettings.data?.find((s) => s.key === 'tax.vatNumber')?.value ||
    order.shop?.vatNumber ||
    '300000000000003';

  const orderNo = order.orderNo;
  const placedAt = order.placedAt ? new Date(order.placedAt) : new Date();
  const cashier = cashierName || order.cashierName || 'Cashier';
  const customerName =
    order.customer?.name && !/walk-?in/i.test(order.customer.name) ? order.customer.name : null;

  const storefrontBase =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : 'http://localhost:3000';
  const onlineReceiptUrl =
    order.onlineReceiptUrl || `${storefrontBase}/en/receipt/${encodeURIComponent(orderNo)}`;
  const qrCodeValue = onlineReceiptUrl;

  const handlePrint = () => {
    // If thermal printer is enabled, attempt hardware ESC/POS print in background
    if (printing.data?.enabled && order.id) {
      printReceipt.mutate({ orderId: order.id });
    }
    // Always trigger browser print as guaranteed immediate printing fallback
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden rounded-2xl border-slate-200"
        closeLabel={t('common.close', 'Close')}
      >
        <DialogTitle className="sr-only">Receipt {orderNo}</DialogTitle>

        {/* Action Header Strip (Hidden on print) */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="size-4 text-primary" />
            <span className="text-xs font-bold text-slate-800">Receipt · {orderNo}</span>
          </div>
          <div className="flex items-center gap-2">
            {onlineReceiptUrl && (
              <a
                href={onlineReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <span>{t('receipt.viewOnline', 'Online')}</span>
                <ExternalLink className="size-3 text-slate-400" />
              </a>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              className="h-8 gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 shadow-xs"
            >
              <Printer className="size-3.5" />
              <span>{t('receipt.print', 'Print')}</span>
            </Button>
          </div>
        </div>

        {/* Printable Thermal Receipt Card */}
        <div className="max-h-[75vh] overflow-y-auto p-6 bg-slate-100/50 flex justify-center print:p-0 print:bg-white print:max-h-none print:overflow-visible">
          <div
            id="pos-receipt-printable"
            className="w-full max-w-[340px] rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm text-slate-900 font-mono text-xs flex flex-col gap-3.5 print:border-none print:shadow-none print:p-0 print:w-[80mm]"
          >
            {/* 1. Store Name Big Text */}
            <div className="text-center">
              <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">
                {shopName}
              </h1>

              {/* 2. Address */}
              {shopAddress && (
                <p className="mt-1 text-[11px] font-normal text-slate-600">{shopAddress}</p>
              )}

              {/* 3. Contact Details */}
              <div className="mt-0.5 text-[11px] font-normal text-slate-600 flex flex-col items-center">
                {shopPhone && <span>Tel: {shopPhone}</span>}
                {vatNumber && <span>VAT: {vatNumber}</span>}
              </div>
            </div>

            <div className="border-b border-dashed border-slate-300" />

            {/* 4. Printing Time, Date & Receipt No */}
            <div className="flex flex-col gap-1 text-[11px] text-slate-700">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Receipt No:</span>
                <span className="font-bold text-slate-900">{orderNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Date:</span>
                <span>{fmt.dateTime(placedAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              {/* 5. Cashier Name */}
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Served by:</span>
                <span>{cashier}</span>
              </div>
              {branchName && (
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Branch:</span>
                  <span>{branchName}</span>
                </div>
              )}
              {/* 6. Customer Name if has */}
              {customerName && (
                <div className="flex justify-between text-slate-900 font-semibold pt-0.5">
                  <span className="text-slate-500">Customer:</span>
                  <span>{customerName}</span>
                </div>
              )}
            </div>

            <div className="border-b border-dashed border-slate-300" />

            {/* 7. Product Info */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                <span>Item</span>
                <span>Total</span>
              </div>
              <ul className="divide-y divide-slate-100 flex flex-col gap-1.5">
                {(order.items ?? []).map((item, idx) => (
                  <li
                    key={`${item.sku || item.name}-${idx}`}
                    className="pt-1 flex flex-col gap-0.5"
                  >
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-bold text-slate-900">
                        {item.qty} × {item.name}
                      </span>
                      <span className="font-bold tabular-nums text-slate-900">
                        {fmt.money(item.lineTotal)}
                      </span>
                    </div>
                    {item.sku && (
                      <div className="text-[10px] text-slate-400">
                        {item.sku} @ {fmt.money(item.unitPrice)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-b border-dashed border-slate-300" />

            {/* 8. Calculation & Payment Info */}
            <div className="flex flex-col gap-1.5 text-xs text-slate-700">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Subtotal:</span>
                <span className="tabular-nums font-medium">
                  {fmt.money(order.totals?.subtotal ?? order.totals?.total)}
                </span>
              </div>

              {Boolean(order.totals?.discountTotal) && (
                <div className="flex justify-between text-[11px] text-rose-600">
                  <span>Discount:</span>
                  <span className="tabular-nums font-medium">
                    -{fmt.money(order.totals.discountTotal)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">VAT (15%):</span>
                <span className="tabular-nums font-medium">
                  {fmt.money(order.totals?.vat ?? 0)}
                </span>
              </div>

              <div className="flex justify-between items-baseline pt-1 border-t border-slate-200 text-sm font-black text-slate-900">
                <span>TOTAL:</span>
                <span className="tabular-nums text-base">{fmt.money(order.totals?.total)}</span>
              </div>

              {/* Payments Tendered */}
              {order.payments?.length > 0 && (
                <div className="mt-1 pt-1.5 border-t border-slate-100 flex flex-col gap-1 text-[11px]">
                  {order.payments.map((p, idx) => (
                    <div key={idx} className="flex justify-between text-slate-600">
                      <span className="capitalize">
                        Paid ({p.label || p.method}
                        {p.reference ? ` - ${p.reference}` : ''}):
                      </span>
                      <span className="tabular-nums font-semibold text-slate-800">
                        {fmt.money(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Change Given */}
              {Boolean(order.changeGiven) && (
                <div className="flex justify-between text-[11px] font-bold text-emerald-700">
                  <span>Change:</span>
                  <span className="tabular-nums">{fmt.money(order.changeGiven)}</span>
                </div>
              )}
            </div>

            <div className="border-b border-dashed border-slate-300" />

            {/* 9. Dynamic QR Code */}
            {qrCodeValue && (
              <div className="flex flex-col items-center gap-1.5 py-1 text-center">
                <div className="p-1 rounded-lg border border-slate-200 bg-white">
                  <QrCode value={qrCodeValue} size={110} />
                </div>
                <span className="text-[10px] text-slate-400">
                  Scan to verify & check sale details online
                </span>
              </div>
            )}

            {/* 10. Thank You */}
            <div className="text-center pt-1">
              <p className="text-xs font-bold text-slate-800">Thank you for your purchase!</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Please retain receipt for returns</p>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls (Hidden on print) */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold rounded-xl"
          >
            {t('common.close', 'Close')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 shadow-sm"
          >
            <Printer className="size-3.5" />
            <span>{t('receipt.print', 'Print Receipt')}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
