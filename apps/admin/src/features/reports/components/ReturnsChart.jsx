import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

const COLORS = [
  '#f43f5e',
  '#6366f1',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#3b82f6',
  '#10b981',
  '#f97316',
  '#84cc16',
];

function ReturnsTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">
          {metric === 'refundAmount' ? 'Refund Amount' : 'Units Returned'}:
        </span>
        <span className="font-semibold text-foreground">
          {metric === 'refundAmount'
            ? fmt.money(Math.round(item.value * 100))
            : fmt.number(item.value)}
        </span>
      </div>
      {item.payload.sharePercent !== undefined && (
        <div className="flex items-center justify-between gap-4 mt-1">
          <span className="text-muted-foreground">Share:</span>
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {item.payload.sharePercent}%
          </span>
        </div>
      )}
    </div>
  );
}

export function ReturnsChart({ chartData = [], dimension = 'all' }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState('refundAmount'); // 'refundAmount' | 'returnedUnits'

  const formattedData = chartData.map((d) => ({
    ...d,
    displayName: d.name && d.name.length > 20 ? `${d.name.slice(0, 18)}…` : d.name || '—',
    val:
      metric === 'refundAmount' ? Number(d.refundAmount ?? 0) / 100 : Number(d.returnedUnits ?? 0),
  }));

  const dimensionLabel = t(`reports.returns.dimensions.${dimension}`, { defaultValue: dimension });

  return (
    <Card className="rounded-lg shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">
          {t('reports.returns.chartTitle', { dimension: dimensionLabel })}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={metric === 'refundAmount' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetric('refundAmount')}
            className="h-7 text-xs font-medium"
          >
            {t('reports.returns.kpis.refundAmount')}
          </Button>
          <Button
            type="button"
            variant={metric === 'returnedUnits' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetric('returnedUnits')}
            className="h-7 text-xs font-medium"
          >
            {t('reports.returns.kpis.returnedUnits')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {formattedData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
            {t('reports.returns.noData')}
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="displayName"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (metric === 'refundAmount' ? `${v} SAR` : fmt.number(v))}
                />
                <Tooltip content={<ReturnsTooltip metric={metric} />} />
                <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                  {formattedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
