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
    },
    {
      title: t('reports.forecast.kpis.projectedUnits'),
      value: fmt.number(forecastTotalUnits),
      subtitle: t('reports.forecast.kpis.unitsHorizon'),
      icon: PackageCheck,
    },
    {
      title: t('reports.forecast.kpis.historicalDailyRate'),
      value: fmt.money(historicalDailyAvgRevenue),
      subtitle: t('reports.forecast.kpis.dailyBaseline'),
      icon: TrendingUp,
    },
    {
      title: t('reports.forecast.kpis.projectedGrowth'),
      value: `${isPositiveGrowth ? '+' : ''}${projectedGrowthPercent}%`,
      subtitle: t('reports.forecast.kpis.vsHistoricalRate'),
      icon: isPositiveGrowth ? ArrowUpRight : ArrowDownRight,
      color: isPositiveGrowth ? 'text-emerald-600' : 'text-rose-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.title} className="p-4 shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{c.title}</span>
                <Icon className={`h-4 w-4 ${c.color || 'text-muted-foreground'}`} />
              </div>
              <div
                className={`mt-2 text-xl font-bold tracking-tight ${c.color || 'text-foreground'}`}
              >
                {c.value}
              </div>
              {c.subtitle && (
                <div className="mt-1 text-[11px] text-muted-foreground">{c.subtitle}</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
