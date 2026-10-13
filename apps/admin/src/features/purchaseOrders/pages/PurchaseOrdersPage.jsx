import { PERMISSIONS as P, PURCHASE } from '@supershop/shared';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
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
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { purchaseOrders } from '../resource';
import { PO_STATUS_TONE } from '../status';

const PAGE_SIZE = 25;

/** Purchase orders in the user's branches: search (PO no., supplier, reference) + status filter. */
export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const status = searchParams[0].get('status') ?? '';
  const { data, isPending, isError, error } = purchaseOrders.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('purchaseOrders.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('purchaseOrders.description')}</p>
        </div>
        {can(P.PURCHASE_MANAGE) && (
          <Button asChild>
            <Link to="/purchase-orders/new">
              <Plus className="size-4" aria-hidden />
              {t('purchaseOrders.add')}
            </Link>
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchForm
          initial={q}
          label={t('purchaseOrders.search')}
          onSearch={(v) => go({ q: v, page: 1 })}
        />
        <Select
          className="w-auto"
          aria-label={t('purchaseOrders.statusFilter')}
          value={status}
          onChange={(e) => go({ status: e.target.value, page: 1 })}
        >
          <option value="">{t('purchaseOrders.allStatuses')}</option>
          {PURCHASE.STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`purchaseOrders.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}

      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('purchaseOrders.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchaseOrders.poNo')}</TableHead>
              <TableHead>{t('purchaseOrders.form.supplier')}</TableHead>
              <TableHead>{t('purchaseOrders.form.branch')}</TableHead>
              <TableHead>{t('purchaseOrders.form.expectedAt')}</TableHead>
              <TableHead className="text-end">{t('purchaseOrders.total')}</TableHead>
              <TableHead>{t('purchaseOrders.received')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((po) => (
              <TableRow key={po.id}>
                <TableCell>
                  <Link
                    to={`/purchase-orders/${po.id}`}
                    className="font-mono text-xs font-medium hover:underline"
                    dir="ltr"
                  >
                    {po.poNo}
                  </Link>
                </TableCell>
                <TableCell>{po.supplier.name}</TableCell>
                <TableCell>{po.branch?.code ?? '—'}</TableCell>
                <TableCell>{po.expectedAt ? fmt.date(po.expectedAt) : '—'}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {fmt.money(po.totals.ordered)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {t('purchaseOrders.unitsOf', {
                    received: po.totals.unitsReceived,
                    total: po.totals.units,
                  })}
                </TableCell>
                <TableCell>
                  <Badge tone={PO_STATUS_TONE[po.status]}>
                    {t(`purchaseOrders.status.${po.status}`)}
                  </Badge>
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
