import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRetranslate, useRetryAllFailed, useRetryJob } from '../hooks';
import { Badge } from './controls';

/** Content translation status, background queue health, failed jobs and retranslate actions. */
export function QueueCard({ overview, canEdit }) {
  const { t } = useTranslation();
  const retranslate = useRetranslate();
  const retryJob = useRetryJob();
  const retryAll = useRetryAllFailed();
  const [confirmAll, setConfirmAll] = useState(false);
  const queue = overview?.queue;
  const content = overview?.content ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('languages.queue.title')}</h2>
        </CardTitle>
        <CardDescription>{t('languages.queue.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {overview && !overview.enabled && <Alert>{t('languages.queue.providerOff')}</Alert>}

        {queue ? (
          <dl className="flex flex-wrap gap-6 text-sm">
            {['waiting', 'active', 'delayed', 'failed', 'completed'].map((k) => (
              <div key={k}>
                <dt className="text-muted-foreground">{t(`languages.queue.counts.${k}`)}</dt>
                <dd className="text-lg font-semibold">{queue.counts[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Alert variant="destructive">{t('languages.queue.unavailable')}</Alert>
        )}

        {content.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pe-4 text-start font-medium">
                  {t('languages.queue.contentType')}
                </th>
                <th className="py-2 pe-4 text-start font-medium">{t('languages.queue.pending')}</th>
                <th className="py-2 pe-4 text-start font-medium">
                  {t('languages.queue.failedItems')}
                </th>
                <th className="py-2 text-start font-medium">{t('languages.queue.manual')}</th>
              </tr>
            </thead>
            <tbody>
              {content.map((c) => (
                <tr key={c.model} className="border-b last:border-0">
                  <td className="py-2 pe-4">{c.model}</td>
                  <td className="py-2 pe-4">{c.pending}</td>
                  <td className="py-2 pe-4">
                    {c.failed ? <Badge tone="bad">{c.failed}</Badge> : 0}
                  </td>
                  <td className="py-2">{c.manual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {queue?.failed?.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">{t('languages.queue.failedJobs')}</h3>
            <ul className="grid gap-2">
              {queue.failed.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                >
                  <span className="min-w-0">
                    <code className="text-xs">{j.id}</code>
                    <span className="block truncate text-muted-foreground">{j.reason}</span>
                  </span>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => retryJob.mutate(j.id)}>
                      {t('languages.queue.retry')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={retranslate.isPending}
              onClick={() => retranslate.mutate('pending_failed')}
            >
              {t('languages.queue.retryPending')}
            </Button>
            {queue?.failed?.length > 0 && (
              <Button variant="outline" onClick={() => retryAll.mutate()}>
                {t('languages.queue.retryAll')}
              </Button>
            )}
            {confirmAll ? (
              <Button
                variant="destructive"
                onClick={() => {
                  retranslate.mutate('all');
                  setConfirmAll(false);
                }}
              >
                {t('languages.queue.confirmAll')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmAll(true)}>
                {t('languages.queue.retranslateAll')}
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t('languages.queue.uiNote')}</p>
      </CardContent>
    </Card>
  );
}
