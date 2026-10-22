import { CUSTOMER_SEGMENTS, PERMISSIONS as P } from '@supershop/shared';
import { Calendar, CheckCircle2, Mail, MessageSquare, Plus, Send, XCircle } from 'lucide-react';
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
import { useCan } from '@/lib/permissions';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useListParams } from '@/lib/useListParams';
import { campaigns, useCancelCampaign, useSendCampaign } from '../resource';
import { CAMPAIGN_SEGMENT_STYLES, CAMPAIGN_STATUS_STYLES } from '../status';

const PAGE_SIZE = 25;

export function CampaignsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const channel = searchParams[0].get('channel') ?? '';
  const status = searchParams[0].get('status') ?? '';
  const segment = searchParams[0].get('segment') ?? '';

  const { data, isPending, isError, error } = campaigns.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(channel && { channel }),
    ...(status && { status }),
    ...(segment && { segment }),
  });

  const sendMutation = useSendCampaign();
  const cancelMutation = useCancelCampaign();

  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  const handleSend = (id) => {
    if (window.confirm(t('campaigns.confirmSend'))) {
      sendMutation.mutate(id);
    }
  };

  const handleCancel = (id) => {
    if (window.confirm(t('campaigns.confirmCancel'))) {
      cancelMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('campaigns.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('campaigns.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/subscribers">
              <Mail className="me-2 size-4" />
              {t('subscribers.title', 'Subscribers')}
            </Link>
          </Button>
          {can(P.CAMPAIGN_MANAGE) && (
            <Button asChild>
              <Link to="/campaigns/new">
                <Plus className="me-2 size-4" />
                {t('campaigns.createButton')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <SearchForm placeholder={t('campaigns.searchPlaceholder')} />
        </div>

        <Select
          value={channel}
          onChange={(val) => go({ channel: val, page: 1 })}
          options={[
            { value: '', label: t('campaigns.allChannels') },
            { value: 'email', label: t('campaigns.channelEmail') },
            { value: 'sms', label: t('campaigns.channelSms') },
          ]}
          className="w-40"
        />

        <Select
          value={status}
          onChange={(val) => go({ status: val, page: 1 })}
          options={[
            { value: '', label: t('campaigns.allStatuses') },
            { value: 'draft', label: t('campaigns.statusDraft') },
            { value: 'scheduled', label: t('campaigns.statusScheduled') },
            { value: 'sending', label: t('campaigns.statusSending') },
            { value: 'sent', label: t('campaigns.statusSent') },
            { value: 'cancelled', label: t('campaigns.statusCancelled') },
          ]}
          className="w-40"
        />

        <Select
          value={segment}
          onChange={(val) => go({ segment: val, page: 1 })}
          options={[
            { value: '', label: t('campaigns.allSegments') },
            ...Object.values(CUSTOMER_SEGMENTS).map((seg) => ({
              value: seg,
              label: t(`customers.segments.${seg}`),
            })),
          ]}
          className="w-44"
        />
      </div>

      {isError && (
        <Alert variant="destructive">{errorMessage(t, error) || t('common.loadFailed')}</Alert>
      )}

      {/* Table */}
      <div className="border rounded bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('campaigns.name')}</TableHead>
              <TableHead>{t('campaigns.channel')}</TableHead>
              <TableHead>{t('campaigns.targetAudience')}</TableHead>
              <TableHead>{t('campaigns.status')}</TableHead>
              <TableHead>{t('campaigns.deliveryStats')}</TableHead>
              <TableHead>{t('campaigns.timing')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell className="text-end">
                    <Skeleton className="h-8 w-16 ms-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {t('campaigns.noCampaigns')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => {
                const isEmail = c.channel === 'email';
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to={`/campaigns/${c.id}`}
                        className="font-medium hover:underline text-foreground block"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">{fmt.date(c.createdAt)}</span>
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        {isEmail ? (
                          <>
                            <Mail className="size-3.5 text-blue-500" />
                            {t('campaigns.channelEmail')}
                          </>
                        ) : (
                          <>
                            <MessageSquare className="size-3.5 text-emerald-500" />
                            {t('campaigns.channelSms')}
                          </>
                        )}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={CAMPAIGN_SEGMENT_STYLES[c.segment] ?? ''}>
                        {t(`customers.segments.${c.segment}`)}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className={CAMPAIGN_STATUS_STYLES[c.status] ?? ''}>
                        {t(`campaigns.statuses.${c.status}`)}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">{c.stats?.sent ?? 0}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          / {c.stats?.targeted ?? 0} {t('campaigns.delivered')}
                        </span>
                        {c.stats?.failed > 0 && (
                          <span className="text-destructive ms-1">
                            ({c.stats.failed} {t('campaigns.failed')})
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {c.scheduledAt ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3 text-blue-500" />
                          <span>{fmt.dateTime(c.scheduledAt)}</span>
                        </div>
                      ) : c.completedAt ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="size-3 text-emerald-500" />
                          <span>{fmt.dateTime(c.completedAt)}</span>
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {can(P.CAMPAIGN_SEND) &&
                          (c.status === 'draft' || c.status === 'scheduled') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-primary"
                              onClick={() => handleSend(c.id)}
                              title={t('campaigns.sendNow')}
                            >
                              <Send className="size-3.5" />
                            </Button>
                          )}

                        {can(P.CAMPAIGN_MANAGE) && c.status === 'scheduled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive"
                            onClick={() => handleCancel(c.id)}
                            title={t('campaigns.cancel')}
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        )}

                        <Button variant="outline" size="sm" asChild className="h-8">
                          <Link to={`/campaigns/${c.id}`}>
                            {c.status === 'draft' ? t('common.edit') : t('common.view')}
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />}
    </div>
  );
}
