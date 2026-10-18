import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FlaskConical,
  RotateCw,
  Search,
  SkipForward,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRetryTrackingLog, useTrackingLogs } from '../resource';
import { LogDetailsDialog } from './LogDetailsDialog';
import { TestEventDialog } from './TestEventDialog';

export function EventLogsTab() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [provider, setProvider] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [selectedLog, setSelectedLog] = useState(null);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);

  const { data, isLoading } = useTrackingLogs({
    page,
    limit: 15,
    provider,
    status,
    search: appliedSearch,
  });

  const retryMutation = useRetryTrackingLog();

  const logs = data?.items || [];
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const handleReset = () => {
    setProvider('all');
    setStatus('all');
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  const statusIcons = {
    success: <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />,
    failed: <AlertCircle className="size-3.5 text-rose-500" aria-hidden />,
    skipped: <SkipForward className="size-3.5 text-amber-500" aria-hidden />,
    pending: <Clock className="size-3.5 text-blue-500 animate-spin" aria-hidden />,
  };

  const statusBadges = {
    success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    skipped: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    pending: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('tracking.logs.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('tracking.logs.description')}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsTestDialogOpen(true)}
          className="gap-1.5 self-start sm:self-auto"
        >
          <FlaskConical className="size-4" />
          {t('tracking.logs.sendTest')}
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="size-4 text-muted-foreground absolute start-2.5 top-2.5" />
            <Input
              placeholder={t('tracking.logs.filters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-8 h-9 text-xs"
            />
          </div>

          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t('tracking.logs.filters.allProviders')}</option>
            <option value="meta">Meta (CAPI)</option>
            <option value="ga4">Google Analytics 4</option>
            <option value="google_ads">Google Ads</option>
            <option value="gtm">GTM</option>
            <option value="tiktok">TikTok</option>
            <option value="snapchat">Snapchat</option>
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{t('tracking.logs.filters.allStatuses')}</option>
            <option value="success">{t('tracking.logs.status.success')}</option>
            <option value="failed">{t('tracking.logs.status.failed')}</option>
            <option value="skipped">{t('tracking.logs.status.skipped')}</option>
            <option value="pending">{t('tracking.logs.status.pending')}</option>
          </select>

          <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs">
            {t('tracking.logs.filters.filter')}
          </Button>

          {(provider !== 'all' || status !== 'all' || appliedSearch) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-9 text-xs text-muted-foreground"
            >
              {t('tracking.logs.filters.reset')}
            </Button>
          )}
        </form>
      </div>

      {/* Logs Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px] text-xs">
                {t('tracking.logs.table.timestamp')}
              </TableHead>
              <TableHead className="w-[100px] text-xs">
                {t('tracking.logs.table.provider')}
              </TableHead>
              <TableHead className="w-[130px] text-xs">{t('tracking.logs.table.event')}</TableHead>
              <TableHead className="w-[110px] text-xs">{t('tracking.logs.table.status')}</TableHead>
              <TableHead className="text-xs">{t('tracking.logs.table.orderOrId')}</TableHead>
              <TableHead className="w-[90px] text-xs">{t('tracking.logs.table.latency')}</TableHead>
              <TableHead className="w-[90px] text-end text-xs">
                {t('tracking.logs.table.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground">
                  {t('tracking.logs.table.empty')}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log._id || log.id} className="hover:bg-muted/40 text-xs">
                  <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold uppercase tracking-wider text-[11px]">
                      {log.provider}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono font-medium">{log.event}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`gap-1 font-normal text-[11px] ${statusBadges[log.status] || ''}`}
                    >
                      {statusIcons[log.status]}
                      {t(`tracking.logs.status.${log.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span>{log.orderNumber || log.eventId}</span>
                      {log.isTest && (
                        <Badge variant="secondary" className="text-[10px] uppercase font-sans">
                          Test
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {log.latencyMs ? `${log.latencyMs} ms` : '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {log.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title={t('tracking.logs.details.retry')}
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(log._id || log.id)}
                        >
                          <RotateCw
                            className={`size-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`}
                          />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title={t('tracking.logs.details.title')}
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
            <div>Total: {pagination.total} events</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5 me-1" />
                Previous
              </Button>
              <span>
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              >
                Next
                <ChevronRight className="size-3.5 ms-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Details & Test Modals */}
      <LogDetailsDialog
        log={selectedLog}
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />

      <TestEventDialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen} />
    </div>
  );
}
