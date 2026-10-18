import { PERMISSIONS as P } from '@supershop/shared';
import {
  Check,
  Copy,
  Download,
  Mail,
  Megaphone,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
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
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { subscribers, useDeleteSubscriber, useUpdateSubscriber } from '../resource';

const PAGE_SIZE = 25;

export function SubscribersPage() {
  const { t } = useTranslation();
  const can = useCan();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const status = searchParams[0].get('status') ?? '';

  const { data, isPending, isError, error } = subscribers.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
  });

  const updateMutation = useUpdateSubscriber();
  const deleteMutation = useDeleteSubscriber();
  const [copiedId, setCopiedId] = useState(null);

  const items = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = meta.total ?? 0;
  const activeCount = meta.activeCount ?? 0;
  const unsubscribedCount = meta.unsubscribedCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleCopy = (email, id) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    toast.success('Email copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleStatus = (subscriber) => {
    const nextStatus = subscriber.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    updateMutation.mutate({ id: subscriber.id, status: nextStatus });
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to remove this subscriber from the list?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExportCsv = () => {
    if (items.length === 0) {
      toast.error('No subscribers to export');
      return;
    }
    const headers = ['Email', 'Status', 'Source', 'Subscribed At', 'Unsubscribed At'];
    const rows = items.map((sub) => [
      `"${sub.email}"`,
      `"${sub.status}"`,
      `"${sub.source}"`,
      `"${sub.subscribedAt || ''}"`,
      `"${sub.unsubscribedAt || ''}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `subscribers-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Subscribers list exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('subscribers.title', 'Newsletter Subscribers')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'subscribers.subtitle',
              'Audience members subscribed to receive email newsletters, offers, and announcements.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/campaigns">
              <Megaphone className="mr-1.5 size-4" />
              {t('subscribers.campaignsButton', 'Marketing Campaigns')}
            </Link>
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={items.length === 0}>
            <Download className="mr-1.5 size-4" />
            {t('subscribers.exportButton', 'Export CSV')}
          </Button>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('subscribers.totalSubscribers', 'Total Subscribers')}
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('subscribers.activeSubscribed', 'Active Subscribed')}
            </CardTitle>
            <UserCheck className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('subscribers.unsubscribed', 'Unsubscribed')}
            </CardTitle>
            <UserX className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{unsubscribedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1 max-w-sm">
          <SearchForm
            placeholder={t('subscribers.searchPlaceholder', 'Search by email address...')}
          />
        </div>
        <div className="w-48">
          <Select
            value={status}
            onChange={(e) => go({ status: e.target.value })}
            options={[
              { value: '', label: t('subscribers.allStatuses', 'All statuses') },
              { value: 'subscribed', label: t('subscribers.statusSubscribed', 'Subscribed') },
              { value: 'unsubscribed', label: t('subscribers.statusUnsubscribed', 'Unsubscribed') },
            ]}
          />
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          {error?.message || 'Could not load newsletter subscribers.'}
        </Alert>
      )}

      {/* Table / List */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('subscribers.email', 'Email Address')}</TableHead>
              <TableHead>{t('subscribers.status', 'Status')}</TableHead>
              <TableHead>{t('subscribers.source', 'Source')}</TableHead>
              <TableHead>{t('subscribers.subscribedAt', 'Subscribed Date')}</TableHead>
              <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell className="text-end">
                    <Skeleton className="ms-auto h-8 w-20" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <Mail className="mx-auto size-8 opacity-40 mb-2" />
                  <p className="text-sm font-medium">
                    {t('subscribers.noSubscribers', 'No newsletter subscribers found.')}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((sub) => {
                const isSubscribed = sub.status === 'subscribed';
                return (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{sub.email}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-foreground"
                          onClick={() => handleCopy(sub.email, sub.id)}
                          title="Copy email"
                          aria-label="Copy email"
                        >
                          {copiedId === sub.id ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isSubscribed ? 'default' : 'secondary'}
                        className={
                          isSubscribed
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                            : ''
                        }
                      >
                        {isSubscribed
                          ? t('subscribers.statusSubscribed', 'Subscribed')
                          : t('subscribers.statusUnsubscribed', 'Unsubscribed')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground font-mono">
                        {sub.source === 'storefront_newsletter'
                          ? 'Storefront VIP Club'
                          : sub.source || 'Direct'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {sub.subscribedAt ? fmt.dateTime(sub.subscribedAt) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {can(P.CAMPAIGN_MANAGE) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8"
                              disabled={updateMutation.isPending}
                              onClick={() => handleToggleStatus(sub)}
                            >
                              {isSubscribed
                                ? t('subscribers.unsubscribe', 'Unsubscribe')
                                : t('subscribers.resubscribe', 'Resubscribe')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:bg-destructive/10"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(sub.id)}
                              title={t('common.delete', 'Delete')}
                              aria-label={t('common.delete', 'Delete')}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && <Pagination page={page} pages={pages} onPage={go} />}
    </div>
  );
}
