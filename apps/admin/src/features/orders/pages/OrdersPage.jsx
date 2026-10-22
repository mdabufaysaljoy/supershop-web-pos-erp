import { ORDER } from '@supershop/shared';
import { Loader2, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/features/settings/components/controls';
import { ExportButton } from '@/features/exports/components/ExportButton';
import { PosReceiptDialog } from '@/features/pos/components/PosReceiptDialog';
import { apiData } from '@/lib/apiClient';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useListParams } from '@/lib/useListParams';
import { orders } from '../resource';
import { ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from '../status';

const PAGE_SIZE = 25;

/** Every order the shop has taken: filter by state or channel, find one by number or phone. */
export function OrdersPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const status = searchParams[0].get('status') ?? '';
  /**
   * The two counters a shop keeps: the till and the website. They are read separately — a
   * cashier's day and an online order queue have nothing to do with each other — so the channel
   * is a tab rather than a filter, and it is always one or the other.
   */
  const channel = searchParams[0].get('channel') === 'online' ? 'online' : 'pos';
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState(null);

  const { data, isPending, isError, error } = orders.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
    ...(channel && { channel }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  const handleOpenReceipt = async (orderId) => {
    try {
      setLoadingReceiptId(orderId);
      const fullOrder = await apiData(`/api/v1/orders/${orderId}`);
      setReceiptOrder(fullOrder);
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setLoadingReceiptId(null);
    }
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('orders.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('orders.description')}</p>
      </header>

      <div role="tablist" aria-label={t('orders.channelFilter')} className="flex gap-1 border-b">
        {ORDER.CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === channel}
            onClick={() => go({ channel: c, page: 1 })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              c === channel
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`orders.channels.${c}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-wrap items-center gap-3">
        <SearchForm
          initial={q}
          label={t('orders.search')}
          onSearch={(v) => go({ q: v, page: 1 })}
        />
        <Select
          className="w-auto"
          aria-label={t('orders.statusFilter')}
          value={status}
          onChange={(e) => go({ status: e.target.value, page: 1 })}
        >
          <option value="">{t('orders.allStatuses')}</option>
          {ORDER.STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.status.${s}`)}
            </option>
          ))}
        </Select>
        <ExportButton
          resource="orders"
          filters={{ q, status, channel }}
          defaultTitle="orders_export"
          className="ms-auto"
        />
      </div>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <p className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t(`orders.emptyChannel.${channel}`)}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('orders.number')}</TableHead>
              <TableHead>{t('orders.placed')}</TableHead>
              <TableHead>{t('orders.customer')}</TableHead>
              <TableHead>{t('orders.statusLabel')}</TableHead>
              <TableHead>{t('orders.payment')}</TableHead>
              <TableHead className="text-end">{t('orders.total')}</TableHead>
              <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link to={`/orders/${order.id}`} className="font-medium hover:underline">
                    {order.orderNo}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {t(`orders.channels.${order.channel}`)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{fmt.dateTime(order.placedAt)}</TableCell>
                <TableCell>
                  {order.customer.name}
                  <span className="block text-xs text-muted-foreground" dir="ltr">
                    {order.customer.phone}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge tone={ORDER_STATUS_TONE[order.status]}>
                    {t(`orders.status.${order.status}`)}
                  </Badge>
                  {order.shipped && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {t('orders.shipped')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge tone={PAYMENT_STATUS_TONE[order.payment.status]}>
                    {t(`orders.paymentStatus.${order.payment.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {fmt.money(order.total)}
                  <span className="block text-xs text-muted-foreground">
                    {t('orders.items', { count: order.itemCount })}
                  </span>
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loadingReceiptId === order.id}
                    onClick={() => handleOpenReceipt(order.id)}
                    className="h-8 gap-1.5 text-xs font-semibold text-slate-700 hover:text-primary"
                    title={t('orders.receipt.reprint', 'Reprint Receipt')}
                  >
                    {loadingReceiptId === order.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Printer className="size-3.5" />
                    )}
                    <span>{t('orders.receipt.reprintShort', 'Receipt')}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />

      {receiptOrder && (
        <PosReceiptDialog
          open={Boolean(receiptOrder)}
          onOpenChange={(val) => !val && setReceiptOrder(null)}
          order={receiptOrder}
          cashierName={receiptOrder.cashierName}
          branchName={receiptOrder.branchName}
        />
      )}
    </div>
  );
}
