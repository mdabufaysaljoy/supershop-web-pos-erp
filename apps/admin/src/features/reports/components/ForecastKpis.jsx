import { ArrowDownRight, ArrowUpRight, DollarSign, PackageCheck, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { fmt } from '@/lib/format';

export function ForecastKpis({ summary = {} }) {
  const { t } = useTranslation();

  const {
    forecastTotalRevenue = 0,
    forecastTotalUnits = 0,
    forecastDailyAvgRevenue = 0,
    historicalDailyAvgRevenue = 0,
    projectedGrowthPercent = 0,
  } = summary;

  const isPositiveGrowth = projectedGrowthPercent >= 0;

  const cards = [
    {
      title: t('reports.forecast.kpis.projectedRevenue'),
      value: fmt.money(forecastTotalRevenue),
      subtitle: `${fmt.money(forecastDailyAvgRevenue)} / ${t('reports.forecast.kpis.perDay')}`,
      icon: DollarSign,
      accent: 'border-t-blue-500',
      badgeClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    },
    {
      title: t('reports.forecast.kpis.projectedUnits'),
      value: fmt.number(forecastTotalUnits),
      subtitle: t('reports.forecast.kpis.unitsHorizon'),
      icon: PackageCheck,
      accent: 'border-t-violet-500',
      badgeClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400',
    },
    {
      title: t('reports.forecast.kpis.historicalDailyRate'),
      value: fmt.money(historicalDailyAvgRevenue),
      subtitle: t('reports.forecast.kpis.dailyBaseline'),
      icon: TrendingUp,
      accent: 'border-t-indigo-500',
      badgeClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
    },
    {
      title: t('reports.forecast.kpis.projectedGrowth'),
      value: `${isPositiveGrowth ? '+' : ''}${projectedGrowthPercent}%`,
      subtitle: t('reports.forecast.kpis.vsHistoricalRate'),
      icon: isPositiveGrowth ? ArrowUpRight : ArrowDownRight,
      color: isPositiveGrowth
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400',
      accent: isPositiveGrowth ? 'border-t-emerald-500' : 'border-t-rose-500',
      badgeClass: isPositiveGrowth
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.title}
            className={`group relative overflow-hidden rounded-md border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 border-t-2 ${c.accent}`}
          >
            <CardContent className="p-0 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                  {c.title}
                </span>
                <div
                  className={`flex size-6 shrink-0 items-center justify-center rounded-sm transition-transform group-hover:scale-105 ${c.badgeClass}`}
                >
                  <Icon className="size-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <div
                  className={`text-lg font-black tracking-tight tabular-nums ${c.color || 'text-slate-900 dark:text-white'}`}
                >
                  {c.value}
                </div>
                {c.subtitle && (
                  <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                    {c.subtitle}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
