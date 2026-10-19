import { PERMISSIONS as P } from '@supershop/shared';
import { CreditCard, Pencil, Printer } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ORDER_STATUS_TONE } from '@/features/orders/status';
import { LoyaltyCardModal } from '@/features/loyalty/components/LoyaltyCardModal';
import { IssueCardDialog } from '@/features/loyalty/components/IssueCardDialog';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { EditCustomerDialog } from '../components/EditCustomerDialog';
import { useCustomer } from '../resource';
import {
  CUSTOMER_SEGMENT_TONE,
  CUSTOMER_STATUS_TONE,
  LEDGER_TYPE_TONE,
  LOYALTY_TIER_TONE,
} from '../status';

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const can = useCan();
  const canManage = can(P.CUSTOMER_MANAGE);
  const [editing, setEditing] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const { data: customer, isPending, isError, error } = useCustomer(id);

  if (isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  if (isPending) return <Skeleton className="h-96" />;

  const stats = customer.stats ?? {};
  const loyalty = customer.loyalty ?? { account: {}, recentLedger: [] };
  const account = loyalty.account ?? {};
  const orders = customer.recentOrders ?? [];
  const addresses = customer.addresses ?? [];
  const ledger = loyalty.recentLedger ?? [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link to="/customers" className="text-sm text-muted-foreground hover:underline">
            ← {t('customers.detail.back')}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <Badge tone={CUSTOMER_SEGMENT_TONE[stats.segment]}>
              {t(`customers.segments.${stats.segment}`)}
            </Badge>
            <Badge tone={CUSTOMER_STATUS_TONE[customer.status]}>
              {t(`customers.status.${customer.status}`)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('customers.detail.registered')}: {fmt.dateTime(customer.createdAt)}
          </p>
        </div>

        {canManage && (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            {t('customers.detail.edit')}
          </Button>
        )}
      </header>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('customers.detail.stats.lifetimeSpend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt.money(stats.lifetimeSpend ?? 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('customers.detail.stats.totalOrders')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.orderCount ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('customers.detail.stats.averageOrder')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt.money(stats.averageOrderValue ?? 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('customers.detail.stats.pointsBalance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{account.pointsBalance ?? 0}</span>
              <Badge tone={LOYALTY_TIER_TONE[account.tier ?? 'bronze']}>
                {t(`customers.tiers.${account.tier ?? 'bronze'}`)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Details */}
        <div className="grid gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{t('customers.detail.title')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div>
                <span className="block text-muted-foreground">{t('customers.name')}</span>
                <span className="font-medium">{customer.name}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">{t('customers.contact')}</span>
                <span>{customer.email || '—'}</span>
                {customer.phone && (
                  <span className="block font-medium" dir="ltr">
                    {customer.phone}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-muted-foreground">
                  {t('customers.detail.language')}
                </span>
                <span className="font-medium">
                  {customer.lang === 'ar' ? 'العربية (Arabic)' : 'English'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Loyalty Card Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <CardTitle className="text-base">
                  {t('customers.detail.loyaltyCard.title', 'Loyalty Card')}
                </CardTitle>
              </div>
              {account.cardNumber && (
                <Badge tone="success" className="text-[10px] uppercase font-bold">
                  {t('customers.detail.loyaltyCard.active', 'Active')}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 text-sm pt-2">
              {account.cardNumber ? (
                <>
                  <div>
                    <span className="block text-xs text-muted-foreground">
                      {t('customers.detail.loyaltyCard.number', 'Card Number')}
                    </span>
                    <span className="font-mono text-sm font-bold tracking-wider">
                      {account.cardNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t('customers.detail.loyaltyCard.issuedDate', 'Issued')}:{' '}
                      {account.cardIssuedAt ? fmt.date(account.cardIssuedAt) : '—'}
                    </span>
                    <span>
                      {t('customers.detail.loyaltyCard.fee', 'Fee')}:{' '}
                      {fmt.money(account.cardFeeHalalas || 0)}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs font-semibold"
                      onClick={() => setCardModalOpen(true)}
                    >
                      <Printer className="size-3.5" />
                      <span>{t('customers.detail.loyaltyCard.print', 'Print Label')}</span>
                    </Button>
                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setIssueModalOpen(true)}
                      >
                        {t('customers.detail.loyaltyCard.reissue', 'Re-issue')}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'customers.detail.loyaltyCard.noCard',
                      'No loyalty card issued for this customer yet.',
                    )}
                  </p>
                  {canManage && (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full gap-1.5 text-xs font-semibold"
                      onClick={() => setIssueModalOpen(true)}
                    >
                      <CreditCard className="size-3.5" />
                      <span>
                        {t('customers.detail.loyaltyCard.issueNow', 'Issue Loyalty Card')}
                      </span>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Addresses */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('customers.detail.addresses.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('customers.detail.addresses.empty')}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((entry, idx) => {
                  const addr = entry.address ?? {};
                  return (
                    <div key={entry._id || idx} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">
                          {entry.label || t('customers.detail.addresses.title')}
                        </span>
                        {entry.isDefault && (
                          <Badge tone="ok">{t('customers.detail.addresses.default')}</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {[addr.line1, addr.district, addr.city].filter(Boolean).join(', ')}
                      </p>
                      {addr.postalCode && (
                        <p className="text-xs text-muted-foreground">
                          Postal Code: {addr.postalCode}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customers.detail.orders.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('customers.detail.orders.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('customers.detail.orders.number')}</TableHead>
                  <TableHead>{t('customers.detail.orders.date')}</TableHead>
                  <TableHead>{t('customers.detail.orders.status')}</TableHead>
                  <TableHead className="text-center">
                    {t('customers.detail.orders.items')}
                  </TableHead>
                  <TableHead className="text-end">{t('customers.detail.orders.total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((ord) => (
                  <TableRow key={ord.id}>
                    <TableCell>
                      <Link to={`/orders/${ord.id}`} className="font-medium hover:underline">
                        {ord.orderNo}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {t(`orders.channels.${ord.channel}`)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmt.dateTime(ord.placedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={ORDER_STATUS_TONE[ord.status]}>
                        {t(`orders.status.${ord.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{ord.itemCount}</TableCell>
                    <TableCell className="text-end whitespace-nowrap font-medium">
                      {fmt.money(ord.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Loyalty Ledger */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customers.detail.loyalty.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('customers.detail.loyalty.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('customers.detail.loyalty.date')}</TableHead>
                  <TableHead>{t('customers.detail.loyalty.type')}</TableHead>
                  <TableHead className="text-end">{t('customers.detail.loyalty.points')}</TableHead>
                  <TableHead className="text-end">
                    {t('customers.detail.loyalty.balance')}
                  </TableHead>
                  <TableHead>{t('customers.detail.loyalty.reason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmt.dateTime(tx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={LEDGER_TYPE_TONE[tx.type]}>
                        {t(`customers.detail.loyalty.types.${tx.type}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end font-medium">
                      {tx.points > 0 ? `+${tx.points}` : tx.points}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground font-mono">
                      {tx.balanceAfter}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.reason || tx.source?.type || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditCustomerDialog customer={customer} open={editing} onClose={() => setEditing(false)} />
      <LoyaltyCardModal
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        customer={customer}
        account={account}
      />
      <IssueCardDialog
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        customer={customer}
        onCardIssued={() => {
          setIssueModalOpen(false);
          setCardModalOpen(true);
        }}
      />
    </div>
  );
}
