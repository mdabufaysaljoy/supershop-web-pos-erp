import { CUSTOMER_SEGMENTS } from '@supershop/shared';
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
import { customers, useCustomerSegments } from '../resource';
import { CUSTOMER_SEGMENT_TONE, CUSTOMER_STATUS_TONE, LOYALTY_TIER_TONE } from '../status';

const PAGE_SIZE = 25;

const SEGMENT_TABS = [
  CUSTOMER_SEGMENTS.ALL,
  CUSTOMER_SEGMENTS.VIP,
  CUSTOMER_SEGMENTS.LOYAL,
  CUSTOMER_SEGMENTS.ACTIVE,
  CUSTOMER_SEGMENTS.NEW,
  CUSTOMER_SEGMENTS.SLIPPING,
  CUSTOMER_SEGMENTS.CHURN_RISK,
  CUSTOMER_SEGMENTS.IDLE,
];

export function CustomersPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const segment = searchParams[0].get('segment') ?? CUSTOMER_SEGMENTS.ALL;
  const status = searchParams[0].get('status') ?? '';

  const { data: counts } = useCustomerSegments({
    ...(q && { q }),
    ...(status && { status }),
  });

  const { data, isPending, isError, error } = customers.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
    ...(segment && segment !== CUSTOMER_SEGMENTS.ALL && { segment }),
  });

  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('customers.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('customers.description')}</p>
      </header>

      {/* Segment Tabs */}
      <div
        role="tablist"
        aria-label={t('customers.title')}
        className="flex flex-wrap items-center gap-1 border-b"
      >
        {SEGMENT_TABS.map((seg) => {
          const isSelected = seg === segment;
          const count = counts?.[seg];
          return (
            <button
              key={seg}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() =>
                go({ segment: seg === CUSTOMER_SEGMENTS.ALL ? undefined : seg, page: 1 })
              }
              className="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors aria-selected:border-primary aria-[selected=false]:border-transparent aria-[selected=false]:text-muted-foreground"
            >
              <span>{t(`customers.segments.${seg}`)}</span>
              {count !== undefined && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchForm
          initial={q}
          label={t('customers.search')}
          onSearch={(v) => go({ q: v, page: 1 })}
        />
        <Select
          className="w-auto"
          aria-label={t('customers.statusFilter')}
          value={status}
          onChange={(e) => go({ status: e.target.value, page: 1 })}
        >
          <option value="">{t('customers.allStatuses')}</option>
          <option value="active">{t('customers.status.active')}</option>
          <option value="disabled">{t('customers.status.disabled')}</option>
        </Select>
        <ExportButton
          resource="customers"
          filters={{ q, status, segment }}
          defaultTitle="customers_export"
          className="ms-auto"
        />
      </div>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}

      {isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('customers.empty')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('customers.name')}</TableHead>
              <TableHead>{t('customers.contact')}</TableHead>
              <TableHead>{t('customers.segment')}</TableHead>
              <TableHead className="text-center">{t('customers.ordersCount')}</TableHead>
              <TableHead className="text-end">{t('customers.lifetimeSpend')}</TableHead>
              <TableHead>{t('customers.lastPurchase')}</TableHead>
              <TableHead>{t('customers.points')}</TableHead>
              <TableHead>{t('customers.statusLabel')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((cust) => (
              <TableRow key={cust.id}>
                <TableCell>
                  <Link to={`/customers/${cust.id}`} className="font-medium hover:underline">
                    {cust.name}
                  </Link>
                  {cust.email && (
                    <span className="block text-xs text-muted-foreground">{cust.email}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm" dir="ltr">
                    {cust.phone || '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge tone={CUSTOMER_SEGMENT_TONE[cust.segment]}>
                    {t(`customers.segments.${cust.segment}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{cust.orderCount}</TableCell>
                <TableCell className="text-end whitespace-nowrap font-medium">
                  {fmt.money(cust.lifetimeSpend)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {cust.lastOrderAt
                    ? fmt.dateTime(cust.lastOrderAt)
                    : t('customers.neverPurchased')}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cust.loyaltyPoints}</span>
                    <Badge tone={LOYALTY_TIER_TONE[cust.loyaltyTier]}>
                      {t(`customers.tiers.${cust.loyaltyTier}`)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge tone={CUSTOMER_STATUS_TONE[cust.status]}>
                    {t(`customers.status.${cust.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} onChange={(p) => go({ page: p })} />}
    </div>
  );
}
