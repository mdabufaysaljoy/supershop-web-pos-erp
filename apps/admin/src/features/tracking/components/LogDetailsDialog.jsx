import { AlertCircle, CheckCircle2, Clock, RotateCw, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useRetryTrackingLog } from '../resource';

export function LogDetailsDialog({ log, open, onOpenChange }) {
  const { t } = useTranslation();
  const retryMutation = useRetryTrackingLog();

  if (!log) return null;

  const statusIcons = {
    success: <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />,
    failed: <AlertCircle className="size-4 text-rose-500" aria-hidden />,
    skipped: <SkipForward className="size-4 text-amber-500" aria-hidden />,
    pending: <Clock className="size-4 text-blue-500 animate-spin" aria-hidden />,
  };

  const statusBadges = {
    success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    failed: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    skipped: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    pending: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  const handleRetry = () => {
    retryMutation.mutate(log._id || log.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" closeLabel={t('tracking.logs.details.close')}>
        <div className="space-y-4">
          <div>
            <DialogTitle className="flex items-center gap-2">
              {statusIcons[log.status]}
              {t('tracking.logs.details.title')}
            </DialogTitle>
            <DialogDescription>
              {new Date(log.createdAt).toLocaleString()} • {log.provider.toUpperCase()} •{' '}
              {log.event}
            </DialogDescription>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg border border-border text-xs">
            <div>
              <span className="text-muted-foreground block">
                {t('tracking.logs.details.provider')}
              </span>
              <span className="font-semibold uppercase">{log.provider}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">
                {t('tracking.logs.details.status')}
              </span>
              <Badge variant="outline" className={`mt-0.5 ${statusBadges[log.status] || ''}`}>
                {t(`tracking.logs.status.${log.status}`)}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground block">
                {t('tracking.logs.details.latency')}
              </span>
              <span className="font-mono font-medium">
                {log.latencyMs ? `${log.latencyMs} ms` : '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">
                {t('tracking.logs.details.attempts')}
              </span>
              <span className="font-mono font-medium">{log.attempts ?? 1}</span>
            </div>
          </div>

          {/* Skip reason / Error alert */}
          {log.skipReason && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-700 dark:text-amber-300">
              <span className="font-semibold">{t('tracking.logs.details.skipReason')}:</span>{' '}
              {log.skipReason}
            </div>
          )}

          {log.errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-xs text-rose-700 dark:text-rose-300">
              <span className="font-semibold">{t('tracking.logs.details.error')}:</span>{' '}
              {log.errorMessage}
            </div>
          )}

          {/* Payload and Response */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('tracking.logs.details.payload')}
              </label>
              <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-52 border border-border">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {t('tracking.logs.details.response')}
              </label>
              <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto max-h-52 border border-border">
                {JSON.stringify(log.response || {}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Dialog Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            {log.status === 'failed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={retryMutation.isPending}
                className="gap-1.5"
              >
                <RotateCw className={`size-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
                {t('tracking.logs.details.retry')}
              </Button>
            )}
            <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
              {t('tracking.logs.details.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
