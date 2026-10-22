import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  DollarSign,
  PackageCheck,
  PackageX,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { fmt } from '@/lib/format';

function DeltaBadge({ changePercent }) {
  if (changePercent == null) return null;
  const isPositive = changePercent > 0;
  const isZero = changePercent === 0;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isZero
          ? 'text-muted-foreground'
          : isPositive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400'
      }`}
    >
      {isPositive && <ArrowUpRight className="h-3 w-3" />}
      {!isPositive && !isZero && <ArrowDownRight className="h-3 w-3" />}
      {isPositive ? `+${changePercent}%` : `${changePercent}%`}
    </span>
  );
}

export function DashboardKpis({ kpis }) {
  const { t } = useTranslation();
  if (!kpis) return null;

  const {
    totalSales = {},
    netSales = {},
    ordersCount = {},
    averageOrderValue = {},
    itemsSold = {},
    newCustomers = {},
    returns = {},
    inventory = {},
  } = kpis;

  const cards = [
    {
      id: 'totalSales',
      title: t('dashboard.kpis.totalSales'),
      value: fmt.money(totalSales.current ?? 0),
      delta: totalSales.changePercent,
      icon: DollarSign,
    },
    {
      id: 'netSales',
      title: t('dashboard.kpis.netSales'),
      value: fmt.money(netSales.current ?? 0),
      delta: netSales.changePercent,
      icon: TrendingUp,
    },
    {
      id: 'ordersCount',
      title: t('dashboard.kpis.orders'),
      value: fmt.number(ordersCount.current ?? 0),
      delta: ordersCount.changePercent,
      icon: ShoppingBag,
    },
    {
      id: 'aov',
      title: t('dashboard.kpis.aov'),
      value: fmt.money(averageOrderValue.current ?? 0),
      delta: averageOrderValue.changePercent,
      icon: DollarSign,
    },
    {
      id: 'itemsSold',
      title: t('dashboard.kpis.itemsSold'),
      value: fmt.number(itemsSold.current ?? 0),
      delta: itemsSold.changePercent,
      icon: PackageCheck,
    },
    {
      id: 'newCustomers',
      title: t('dashboard.kpis.newCustomers'),
      value: fmt.number(newCustomers.current ?? 0),
      delta: newCustomers.changePercent,
      icon: Users,
    },
    {
      id: 'returns',
      title: t('dashboard.kpis.returns'),
      value: fmt.number(returns.totalCount?.current ?? 0),
      delta: returns.totalCount?.changePercent,
      icon: RotateCcw,
    },
    {
      id: 'refunds',
      title: t('dashboard.kpis.refunds'),
      value: fmt.money(returns.refundAmount?.current ?? 0),
      delta: returns.refundAmount?.changePercent,
      icon: ArrowLeftRight,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.id} className="py-4 shadow-xs">
            <CardContent className="px-4 py-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{card.title}</span>
                <div className="rounded bg-muted p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tracking-tight">{card.value}</span>
                <div className="flex items-center gap-1">
                  <DeltaBadge changePercent={card.delta} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Inventory alert cards */}
      <Card className="py-4 shadow-xs border-amber-500/20 bg-amber-500/5">
        <CardContent className="px-4 py-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {t('dashboard.kpis.lowStock')}
            </span>
            <div className="rounded bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-900 dark:text-amber-200">
              {fmt.number(inventory.lowStockCount ?? 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="py-4 shadow-xs border-rose-500/20 bg-rose-500/5">
        <CardContent className="px-4 py-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-rose-900 dark:text-rose-200">
              {t('dashboard.kpis.outOfStock')}
            </span>
            <div className="rounded bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
              <PackageX className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-900 dark:text-rose-200">
              {fmt.number(inventory.outOfStockCount ?? 0)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
