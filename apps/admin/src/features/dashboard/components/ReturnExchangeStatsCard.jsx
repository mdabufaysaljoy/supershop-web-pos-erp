import { ArrowUpRight, Globe, RotateCcw, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

export function ReturnExchangeStatsCard({ returnsOverview }) {
  const { t } = useTranslation();

  if (!returnsOverview) return null;

  const { summary = {}, byChannel = {}, recentReturns = [] } = returnsOverview;
  const posStats = byChannel.pos ?? {};
  const onlineStats = byChannel.online ?? {};

  return (
    <Card className="rounded shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded bg-rose-50 p-1.5 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">
              {t('dashboard.returnsCard.title')}
            </CardTitle>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
          <Link to="/reports?tab=returns">
            {t('dashboard.returnsCard.viewReport')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Top 4 Metrics Summary Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-xs text-muted-foreground">
              {t('dashboard.returnsCard.returns')}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {fmt.number(summary.returnsCount ?? 0)}
              </span>
              <span className="text-2xs text-muted-foreground font-medium">
                ({summary.returnedUnits ?? 0} {t('reports.columns.units').toLowerCase()})
              </span>
            </div>
          </div>

          <div className="rounded border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-xs text-muted-foreground">
              {t('dashboard.returnsCard.exchanges')}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {fmt.number(summary.exchangesCount ?? 0)}
              </span>
              <span className="text-2xs text-muted-foreground font-medium">
                ({summary.exchangedUnits ?? 0} {t('reports.columns.units').toLowerCase()})
              </span>
            </div>
          </div>

          <div className="rounded border border-rose-200/80 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
            <span className="text-xs font-medium text-rose-800 dark:text-rose-300">
              {t('dashboard.returnsCard.totalRefunded')}
            </span>
            <div className="mt-1">
              <span className="text-xl font-bold tracking-tight text-rose-700 dark:text-rose-400">
                {fmt.money(summary.refundAmount ?? 0)}
              </span>
            </div>
          </div>

          <div className="rounded border border-indigo-200/80 bg-indigo-50/40 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <span className="text-xs font-medium text-indigo-800 dark:text-indigo-300">
              {t('dashboard.returnsCard.returnRate')}
            </span>
            <div className="mt-1">
              <span className="text-xl font-bold tracking-tight text-indigo-700 dark:text-indigo-400">
                {summary.returnRate ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Channel Breakdown Comparison (POS vs Online) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded border p-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold">{t('dashboard.returnsCard.posChannel')}</p>
                <p className="text-2xs text-muted-foreground">
                  {fmt.number(posStats.returnsCount ?? 0)}{' '}
                  {t('dashboard.returnsCard.returns').toLowerCase()} •{' '}
                  {fmt.number(posStats.exchangesCount ?? 0)}{' '}
                  {t('dashboard.returnsCard.exchanges').toLowerCase()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold tabular-nums text-foreground">
                {fmt.money(posStats.refundAmount ?? 0)}
              </p>
              <p className="text-2xs text-muted-foreground">{t('dashboard.kpis.refunds')}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border p-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold">{t('dashboard.returnsCard.onlineChannel')}</p>
                <p className="text-2xs text-muted-foreground">
                  {fmt.number(onlineStats.returnsCount ?? 0)}{' '}
                  {t('dashboard.returnsCard.returns').toLowerCase()} •{' '}
                  {fmt.number(onlineStats.exchangesCount ?? 0)}{' '}
                  {t('dashboard.returnsCard.exchanges').toLowerCase()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold tabular-nums text-foreground">
                {fmt.money(onlineStats.refundAmount ?? 0)}
              </p>
              <p className="text-2xs text-muted-foreground">{t('dashboard.kpis.refunds')}</p>
            </div>
          </div>
        </div>

        {/* Recent Return & Exchange Records Table */}
        {recentReturns.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('dashboard.returnsCard.title')}
              </span>
              <span className="text-2xs text-muted-foreground">
                {recentReturns.length} {t('common.recent').toLowerCase()}
              </span>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="py-2 px-3 font-semibold">{t('reports.returns.columns.name')}</th>
                    <th className="py-2 px-3 font-semibold">
                      {t('reports.returns.columns.order')}
                    </th>
                    <th className="py-2 px-3 font-semibold">{t('reports.returns.columns.type')}</th>
                    <th className="py-2 px-3 font-semibold">
                      {t('reports.returns.columns.channel')}
                    </th>
                    <th className="py-2 px-3 font-semibold text-right">
                      {t('reports.returns.columns.returnedUnits')}
                    </th>
                    <th className="py-2 px-3 font-semibold text-right">
                      {t('reports.returns.columns.refundAmount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium text-foreground">{r.returnNo}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        <Link to={`/orders/${r.orderNo}`} className="hover:underline text-primary">
                          {r.orderNo}
                        </Link>
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={`rounded text-2xs px-1.5 py-0 capitalize ${
                            r.type === 'exchange'
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}
                        >
                          {r.type}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 uppercase text-2xs text-muted-foreground font-semibold">
                        {r.channel}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.returnedUnits}</td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-foreground">
                        {fmt.money(r.refundAmount || r.differenceDue || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
