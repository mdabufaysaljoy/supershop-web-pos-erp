import { Coins, DollarSign, PackageCheck, Receipt, ShoppingBag, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { fmt } from '@/lib/format';

export function PerformanceSummaryKpis({ summary = {} }) {
  const { t } = useTranslation();

  const {
    totalRevenue = 0,
    totalNet = 0,
    totalOrders = 0,
    totalUnits = 0,
    averageOrderValue = 0,
    totalProfit,
    overallMargin,
  } = summary;

  const cards = [
    {
      title: t('reports.metrics.totalRevenue'),
      value: fmt.money(totalRevenue),
      icon: DollarSign,
      accent: 'border-t-blue-500',
      badgeClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    },
    {
      title: t('reports.metrics.netSales'),
      value: fmt.money(totalNet),
      icon: TrendingUp,
      accent: 'border-t-indigo-500',
      badgeClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
    },
    {
      title: t('reports.metrics.unitsSold'),
      value: fmt.number(totalUnits),
      icon: PackageCheck,
      accent: 'border-t-violet-500',
      badgeClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400',
    },
    {
      title: t('reports.metrics.totalOrders'),
      value: fmt.number(totalOrders),
      icon: ShoppingBag,
      accent: 'border-t-amber-500',
      badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
    },
    {
      title: t('reports.metrics.aov'),
      value: fmt.money(averageOrderValue),
      icon: Receipt,
      accent: 'border-t-sky-500',
      badgeClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',
    },
  ];

  if (totalProfit !== undefined) {
    cards.push({
      title: t('reports.metrics.totalProfit'),
      value: fmt.money(totalProfit),
      subtitle: `${overallMargin ?? 0}% ${t('reports.metrics.margin')}`,
      icon: Coins,
      accent: 'border-t-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                <div className="text-lg font-black tracking-tight text-slate-900 dark:text-white tabular-nums">
                  {c.value}
                </div>
                {c.subtitle && (
                  <div className="mt-1 flex items-center">
                    <span className="inline-flex items-center rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      {c.subtitle}
                    </span>
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
