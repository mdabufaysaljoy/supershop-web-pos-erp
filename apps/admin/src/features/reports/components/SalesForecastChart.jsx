import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

function ForecastTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const pData = payload[0]?.payload;
  if (!pData) return null;

  const isForecast = pData.type === 'forecast';

  return (
    <div className="rounded-lg border bg-background p-3 text-xs shadow-md space-y-1">
      <div className="flex items-center justify-between gap-3 font-semibold text-foreground border-b pb-1">
        <span>{label}</span>
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
            isForecast
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          }`}
        >
          {isForecast ? 'Forecast' : 'Actual'}
        </span>
      </div>

      {pData.actual != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">
            {metric === 'revenue' ? 'Actual Revenue' : 'Actual Units'}:
          </span>
          <span className="font-semibold text-foreground">
            {metric === 'revenue'
              ? fmt.money(Math.round(pData.actual * 100))
              : fmt.number(pData.actual)}
          </span>
        </div>
      )}

      {pData.forecast != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-purple-600 dark:text-purple-400 font-medium">
            {metric === 'revenue' ? 'Projected Revenue' : 'Projected Units'}:
          </span>
          <span className="font-semibold text-foreground">
            {metric === 'revenue'
              ? fmt.money(Math.round(pData.forecast * 100))
              : fmt.number(pData.forecast)}
          </span>
        </div>
      )}

      {isForecast && pData.lower != null && pData.upper != null && (
        <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground pt-1 border-t">
          <span>95% Confidence:</span>
          <span>
            {metric === 'revenue'
              ? `${fmt.money(Math.round(pData.lower * 100))} – ${fmt.money(Math.round(pData.upper * 100))}`
              : `${pData.lower} – ${pData.upper} units`}
          </span>
        </div>
      )}
    </div>
  );
}

export function SalesForecastChart({ historical = [], forecast = [] }) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'quantity'

  // Combine historical and forecast data for contiguous charting
  const chartData = [
    ...historical.map((h, i) => {
      const isTransition = i === historical.length - 1;
      const val = metric === 'revenue' ? (h.revenue || 0) / 100 : h.quantity || 0;
      return {
        date: h.date,
        displayDate: h.date.slice(5), // MM-DD
        actual: val,
        forecast: isTransition ? val : null,
        lower: null,
        upper: null,
        type: 'actual',
      };
    }),
    ...forecast.map((f) => {
      const fVal = metric === 'revenue' ? (f.revenue || 0) / 100 : f.quantity || 0;
      const lower = metric === 'revenue' ? (f.lowerRevenue || 0) / 100 : f.lowerQuantity || 0;
      const upper = metric === 'revenue' ? (f.upperRevenue || 0) / 100 : f.upperQuantity || 0;
      return {
        date: f.date,
        displayDate: f.date.slice(5),
        actual: null,
        forecast: fVal,
        lower,
        upper,
        type: 'forecast',
      };
    }),
  ];

  const hasData = chartData.length > 0;

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">
            {t('reports.forecast.chartTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('reports.forecast.chartSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-1 bg-muted/30">
          <Button
            size="sm"
            variant={metric === 'revenue' ? 'default' : 'ghost'}
            className="h-7 text-xs px-2.5"
            onClick={() => setMetric('revenue')}
          >
            {t('reports.metrics.revenue')}
          </Button>
          <Button
            size="sm"
            variant={metric === 'quantity' ? 'default' : 'ghost'}
            className="h-7 text-xs px-2.5"
            onClick={() => setMetric('quantity')}
          >
            {t('reports.metrics.units')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-blue-600 rounded" />
            <span>{t('reports.forecast.legend.actual')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-purple-600" />
            <span>{t('reports.forecast.legend.forecast')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-4 bg-purple-200 dark:bg-purple-900/40 rounded-xs" />
            <span>{t('reports.forecast.legend.confidence')}</span>
          </div>
        </div>

        {!hasData ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
            {t('reports.empty')}
          </div>
        ) : (
          <div className="h-72 w-full min-w-0" style={{ minHeight: 288 }}>
            <ResponsiveContainer width="100%" height={288} minWidth={0} minHeight={288}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  tickFormatter={(val) =>
                    metric === 'revenue'
                      ? val >= 1000
                        ? `${(val / 1000).toFixed(0)}k`
                        : `${val}`
                      : `${val}`
                  }
                />
                <Tooltip content={<ForecastTooltip metric={metric} />} />
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="none"
                  fill="#c084fc"
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#2563eb' }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2.5, fill: '#9333ea' }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
