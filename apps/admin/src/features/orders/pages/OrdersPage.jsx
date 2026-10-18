import { ORDER } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  const channel = searchParams[0].get('channel') ?? '';
  const { data, isPending, isError, error } = orders.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
    ...(channel && { channel }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('orders.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('orders.description')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
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
        <Select
          className="w-auto"
          aria-label={t('orders.channelFilter')}
          value={channel}
          onChange={(e) => go({ channel: e.target.value, page: 1 })}
        >
          <option value="">{t('orders.allChannels')}</option>
          {ORDER.CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`orders.channels.${c}`)}
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
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('orders.empty')}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
    </div>
  );
}
