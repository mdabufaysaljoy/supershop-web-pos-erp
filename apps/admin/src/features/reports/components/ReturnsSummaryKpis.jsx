import {
  ArrowLeftRight,
  CheckCircle2,
  DollarSign,
  PackageMinus,
  Repeat,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { fmt } from '@/lib/format';

export function ReturnsSummaryKpis({ summary = {} }) {
  const { t } = useTranslation();

  const {
    totalReturns = 0,
    totalExchanges = 0,
    totalCount = 0,
    refundAmount = 0,
    differenceDue = 0,
    returnedUnits = 0,
    exchangedUnits = 0,
  } = summary;

  const kpis = [
    {
      id: 'totalReturns',
      label: t('reports.returns.kpis.totalReturns'),
      value: fmt.number(totalReturns),
      sublabel: `${returnedUnits} ${t('reports.returns.columns.returnedUnits').toLowerCase()}`,
      icon: RotateCcw,
      topBorder: 'border-t-rose-500',
      iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
    },
    {
      id: 'totalExchanges',
      label: t('reports.returns.kpis.totalExchanges'),
      value: fmt.number(totalExchanges),
      sublabel: `${exchangedUnits} ${t('reports.returns.columns.exchangedUnits').toLowerCase()}`,
      icon: Repeat,
      topBorder: 'border-t-indigo-500',
      iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
    },
    {
      id: 'totalCount',
      label: t('reports.returns.kpis.totalCount'),
      value: fmt.number(totalCount),
      sublabel: null,
      icon: ArrowLeftRight,
      topBorder: 'border-t-amber-500',
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    },
    {
      id: 'refundAmount',
      label: t('reports.returns.kpis.refundAmount'),
      value: fmt.money(refundAmount),
      sublabel: null,
      icon: DollarSign,
      topBorder: 'border-t-red-500',
      iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    },
    {
      id: 'differenceDue',
      label: t('reports.returns.kpis.differenceDue'),
      value: fmt.money(differenceDue),
      sublabel: null,
      icon: CheckCircle2,
      topBorder: 'border-t-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    },
    {
      id: 'returnedUnits',
      label: t('reports.returns.kpis.returnedUnits'),
      value: fmt.number(returnedUnits),
      sublabel: null,
      icon: PackageMinus,
      topBorder: 'border-t-violet-500',
      iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={kpi.id}
            className={`rounded-md border border-slate-200/90 shadow-xs border-t-2 ${kpi.topBorder} dark:border-slate-800 transition-all hover:shadow-sm`}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </span>
                <div className={`rounded-sm p-1.5 ${kpi.iconBg}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-1">
                <span className="text-lg font-black tracking-tight tabular-nums text-foreground">
                  {kpi.value}
                </span>
              </div>
              {kpi.sublabel && (
                <p className="mt-0.5 text-2xs text-muted-foreground font-medium">{kpi.sublabel}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
