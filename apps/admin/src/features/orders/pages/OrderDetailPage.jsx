import { Printer, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PosReceiptDialog } from '@/features/pos/components/PosReceiptDialog';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { NotesCard } from '../components/NotesCard';
import { OrderInvoice } from '../components/OrderInvoice';
import { ShipmentCard } from '../components/ShipmentCard';
import { StatusActions } from '../components/StatusActions';
import { useOrder } from '../resource';
import { ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from '../status';

/** One order: what was bought, where it is, what the shop may do next — and a printable invoice. */
export function OrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data: order, isPending, isError, error } = useOrder(id);
  const settings = useSettings('general');
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  if (isPending) return <Skeleton className="h-96" />;

  const settingName = settings.data?.find((s) => s.key === 'store.name')?.value;
  const settingVat = settings.data?.find((s) => s.key === 'tax.vatNumber')?.value;
  const store = {
    ...order.shop,
    ...(settingName && { name: settingName }),
    ...(settingVat && { vatNumber: settingVat }),
  };
  const address = order.address ?? {};

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="grid gap-1">
          <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
            ← {t('orders.title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {order.orderNo}
            <Badge tone={ORDER_STATUS_TONE[order.status]}>
              {t(`orders.status.${order.status}`)}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmt.dateTime(order.placedAt)} · {t(`orders.channels.${order.channel}`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReceiptOpen(true)}
            className="gap-1.5"
          >
            <Receipt className="size-4" aria-hidden />
            {t('orders.receipt.print', 'Reprint Receipt')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="size-4" aria-hidden />
            {t('orders.invoice.print')}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 print:hidden lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('orders.items', { count: order.totals.itemCount })}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ul className="grid gap-3">
                {order.items.map((i) => (
                  <li key={i.variantId} className="flex items-start justify-between gap-4 text-sm">
                    <span>
                      <span className="font-medium">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {i.sku}
                        {i.options.length > 0 &&
                          ` · ${i.options.map((o) => `${o.name}: ${o.value}`).join(' · ')}`}
                      </span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {fmt.number(i.qty)} × {fmt.money(i.unitPrice)}
                    </span>
                    <span className="tabular-nums">{fmt.money(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <dl className="grid gap-1 border-t pt-3 text-sm">
                <Row
                  label={t('orders.invoice.subtotal')}
                  value={fmt.money(order.totals.subtotal)}
                />
                {order.totals.deliveryFee > 0 && (
                  <Row
                    label={t('orders.invoice.delivery')}
                    value={fmt.money(order.totals.deliveryFee)}
                  />
                )}
                {order.totals.paymentFee > 0 && (
                  <Row
                    label={order.payment.label ?? t('orders.invoice.paymentFee')}
                    value={fmt.money(order.totals.paymentFee)}
                  />
                )}
                <Row label={t('orders.invoice.vat')} value={fmt.money(order.totals.vat)} />
                <Row
                  label={t('orders.invoice.total')}
                  value={fmt.money(order.totals.total)}
                  strong
                />
              </dl>
            </CardContent>
          </Card>

          <ShipmentCard order={order} />
          <NotesCard order={order} />

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('orders.history.title')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 text-sm">
                {order.statusHistory.length === 0 && (
                  <li className="text-muted-foreground">{t('orders.history.none')}</li>
                )}
                {order.statusHistory.map((h) => (
                  <li key={`${h.at}-${h.to}`} className="grid gap-0.5">
                    <span>
                      {t(`orders.status.${h.from}`)} → {t(`orders.status.${h.to}`)}
                      {h.restocked && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          {t('orders.history.restocked')}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt.dateTime(h.at)} · {t(`orders.history.by.${h.by}`)}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <aside className="grid gap-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('orders.actions.title')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusActions order={order} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('orders.customer')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <span className="font-medium">{order.customer.name}</span>
              <span dir="ltr">{order.customer.phone}</span>
              {order.customer.email && <span dir="ltr">{order.customer.email}</span>}
              <span className="mt-2 text-muted-foreground">
                {[address.line1, address.district, address.city, address.postalCode]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('orders.payment')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <span>{order.payment.label ?? order.payment.method}</span>
              <Badge tone={PAYMENT_STATUS_TONE[order.payment.status]}>
                {t(`orders.paymentStatus.${order.payment.status}`)}
              </Badge>
            </CardContent>
          </Card>
        </aside>
      </div>

      <OrderInvoice order={order} store={store} />

      {receiptOpen && (
        <PosReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          order={order}
          cashierName={order.cashierName}
          branchName={store.name}
        />
      )}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t pt-2 font-semibold' : ''}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
