import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

function CustomTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      <div className="grid gap-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-semibold">
              {metric === 'revenue'
                ? fmt.money(Math.round(entry.value * 100))
                : fmt.number(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalesOverTimeChart({ data = [] }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'orders'

  // Format money in SAR for chart points (halalas / 100)
  const chartData = data.map((d) => ({
    ...d,
    revenueSar: Number(((d.revenue ?? 0) / 100).toFixed(2)),
    posRevenueSar: Number(((d.posRevenue ?? 0) / 100).toFixed(2)),
    onlineRevenueSar: Number(((d.onlineRevenue ?? 0) / 100).toFixed(2)),
  }));

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          {t('dashboard.charts.salesTrend')}
        </CardTitle>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          <Button
            type="button"
            size="sm"
            variant={metric === 'revenue' ? 'default' : 'ghost'}
            className="h-7 text-xs px-2.5"
            onClick={() => setMetric('revenue')}
          >
            {t('dashboard.charts.revenue')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={metric === 'orders' ? 'default' : 'ghost'}
            className="h-7 text-xs px-2.5"
            onClick={() => setMetric('orders')}
          >
            {t('dashboard.charts.orders')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            {t('dashboard.charts.noData')}
          </div>
        ) : (
          <div className="h-72 w-full pt-4" data-testid="sales-chart">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={250}
              initialDimension={{ width: 600, height: 288 }}
            >
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(val) => (metric === 'revenue' ? `${val}` : `${val}`)}
                />
                <Tooltip content={<CustomTooltip metric={metric} />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                {metric === 'revenue' ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="posRevenueSar"
                      name={t('dashboard.charts.posRevenue')}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPos)"
                    />
                    <Area
                      type="monotone"
                      dataKey="onlineRevenueSar"
                      name={t('dashboard.charts.onlineRevenue')}
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorOnline)"
                    />
                  </>
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey="posOrders"
                      name={t('dashboard.channels.pos')}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPos)"
                    />
                    <Area
                      type="monotone"
                      dataKey="onlineOrders"
                      name={t('dashboard.channels.online')}
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorOnline)"
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
