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
    },
    {
      title: t('reports.metrics.netSales'),
      value: fmt.money(totalNet),
      icon: TrendingUp,
    },
    {
      title: t('reports.metrics.unitsSold'),
      value: fmt.number(totalUnits),
      icon: PackageCheck,
    },
    {
      title: t('reports.metrics.totalOrders'),
      value: fmt.number(totalOrders),
      icon: ShoppingBag,
    },
    {
      title: t('reports.metrics.aov'),
      value: fmt.money(averageOrderValue),
      icon: Receipt,
    },
  ];

  if (totalProfit !== undefined) {
    cards.push({
      title: t('reports.metrics.totalProfit'),
      value: fmt.money(totalProfit),
      subtitle: `${overallMargin ?? 0}% ${t('reports.metrics.margin')}`,
      icon: Coins,
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.title} className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{c.title}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-1 text-lg font-bold tracking-tight">{c.value}</div>
              {c.subtitle && (
                <div className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {c.subtitle}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
