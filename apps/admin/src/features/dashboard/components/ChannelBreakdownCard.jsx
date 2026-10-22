import { Monitor, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

export function ChannelBreakdownCard({ channels }) {
  const { t } = useTranslation();
  if (!channels) return null;

  const posRev = channels.pos?.revenue ?? 0;
  const onlineRev = channels.online?.revenue ?? 0;
  const totalRev = posRev + onlineRev;

  const posPct = totalRev > 0 ? Math.round((posRev / totalRev) * 100) : 0;
  const onlinePct = totalRev > 0 ? 100 - posPct : 0;

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t('dashboard.channels.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Split progress bar */}
        <div className="space-y-2">
          <div className="h-3 w-full overflow-hidden rounded bg-muted flex">
            <div
              className="bg-blue-500 transition-all"
              style={{ width: `${posPct}%` }}
              title={`POS: ${posPct}%`}
            />
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${onlinePct}%` }}
              title={`Online: ${onlinePct}%`}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-blue-500" />
              {t('dashboard.channels.pos')} ({posPct}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-emerald-500" />
              {t('dashboard.channels.online')} ({onlinePct}%)
            </span>
          </div>
        </div>

        {/* Detailed channel stats */}
        <div className="grid gap-3">
          <div className="flex items-center justify-between rounded border p-3">
            <div className="flex items-center gap-3">
              <div className="rounded bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                <Monitor className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('dashboard.channels.pos')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.channels.ordersCount', { count: channels.pos?.orders ?? 0 })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{fmt.money(posRev)}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.channels.share', { percent: posPct })}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border p-3">
            <div className="flex items-center gap-3">
              <div className="rounded bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('dashboard.channels.online')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.channels.ordersCount', { count: channels.online?.orders ?? 0 })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{fmt.money(onlineRev)}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.channels.share', { percent: onlinePct })}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
