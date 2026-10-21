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
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#f97316',
  '#84cc16',
];

function PerformanceTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded border bg-background p-3 text-xs shadow-md">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{metric === 'revenue' ? 'Revenue' : 'Units'}:</span>
        <span className="font-semibold text-foreground">
          {metric === 'revenue' ? fmt.money(Math.round(item.value * 100)) : fmt.number(item.value)}
        </span>
      </div>
      {item.payload.sharePercent !== undefined && (
        <div className="flex items-center justify-between gap-4 mt-1">
          <span className="text-muted-foreground">Share:</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {item.payload.sharePercent}%
          </span>
        </div>
      )}
    </div>
  );
}

export function PerformanceChart({ chartData = [], dimension = 'product' }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'quantity'

  const formattedData = chartData.map((d) => ({
    ...d,
    displayName: d.name && d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name || '—',
    revenueSar: Number(((d.revenue ?? 0) / 100).toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          {t('reports.topPerformers', { dimension: t(`reports.dimensions.${dimension}`) })}
        </CardTitle>
        <div className="flex items-center gap-1 rounded border bg-muted/40 p-1">
          <Button
            type="button"
            size="sm"
            variant={metric === 'revenue' ? 'default' : 'ghost'}
            className="h-6 px-2.5 text-xs"
            onClick={() => setMetric('revenue')}
          >
            {t('reports.metrics.revenue')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={metric === 'quantity' ? 'default' : 'ghost'}
            className="h-6 px-2.5 text-xs"
            onClick={() => setMetric('quantity')}
          >
            {t('reports.metrics.units')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {formattedData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            {t('reports.noData')}
          </div>
        ) : (
          <div className="h-72 w-full" style={{ minWidth: 0, minHeight: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis
                  dataKey="displayName"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tickFormatter={(val) =>
                    metric === 'revenue'
                      ? `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      : val
                  }
                />
                <Tooltip
                  content={<PerformanceTooltip metric={metric} />}
                  cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                />
                <Bar
                  dataKey={metric === 'revenue' ? 'revenueSar' : 'quantity'}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                >
                  {formattedData.map((_, index) => (
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
