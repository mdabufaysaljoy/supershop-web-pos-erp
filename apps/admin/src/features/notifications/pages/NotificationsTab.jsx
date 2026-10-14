import { PERMISSIONS } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettings } from '@/features/settings/hooks';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';
import { ChannelsCard } from '../components/ChannelsCard';
import { TemplateRow } from '../components/TemplateRow';
import { useNotificationLogs, useTemplates } from '../hooks';

const LOG_TONE = { sent: 'ok', failed: 'bad', skipped: 'muted' };

/**
 * Settings → Notifications (P4.5): the messages the shop sends, the channels that carry them, and
 * the last few that went out — the honest answer to "did the customer get it?".
 */
export function NotificationsTab() {
  const { t } = useTranslation();
  const canEdit = useCan()(PERMISSIONS.SETTINGS_NOTIFICATIONS);
  const templates = useTemplates();
  const settings = useSettings('notifications');
  const logs = useNotificationLogs();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('notifications.templates.title')}</h2>
          </CardTitle>
          <CardDescription>{t('notifications.templates.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {templates.isPending && (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          <ul aria-label={t('notifications.templates.title')} className="grid gap-3">
            {(templates.data ?? []).map((template) => (
              <TemplateRow key={template.id} template={template} canEdit={canEdit} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <ChannelsCard settings={settings.data} canEdit={canEdit} />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('notifications.log.title')}</h2>
          </CardTitle>
          <CardDescription>{t('notifications.log.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {(logs.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t('notifications.log.empty')}</p>
          ) : (
            <ul aria-label={t('notifications.log.title')} className="grid gap-2 text-sm">
              {logs.data.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={LOG_TONE[entry.status]}>
                    {t(`notifications.log.status.${entry.status}`)}
                  </Badge>
                  <span className="font-medium">
                    {t(`notifications.events.${entry.event}`, { defaultValue: entry.event })}
                  </span>
                  <span dir="ltr" className="text-muted-foreground">
                    {entry.to}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmt.dateTime(entry.at)}</span>
                  {entry.error && <span className="text-xs text-destructive">{entry.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
