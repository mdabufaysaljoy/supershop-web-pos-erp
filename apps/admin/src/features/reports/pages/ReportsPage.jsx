import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ForecastView } from '../components/ForecastView';
import { PerformanceChart } from '../components/PerformanceChart';
import { PerformanceFilters } from '../components/PerformanceFilters';
import { PerformanceSummaryKpis } from '../components/PerformanceSummaryKpis';
import { PerformanceTable } from '../components/PerformanceTable';
import { downloadCsv } from '../csvExport';
import { usePerformanceReport } from '../resource';

export function ReportsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('performance'); // 'performance' | 'forecasting'
  const [dimension, setDimension] = useState('product');
  const [range, setRange] = useState('7d');
  const [branchId, setBranchId] = useState(null);
  const [sortBy, setSortBy] = useState('revenue');
  const [sortDir, setSortDir] = useState('desc');

  const { data, isLoading, isError, refetch } = usePerformanceReport({
    dimension,
    range,
    branchId,
    sortBy,
    sortDir,
    limit: 100,
  });

  const report = data ?? {
    summary: {},
    items: [],
    chart: [],
  };

  const handleExportCsv = () => {
    if (!report.items?.length) return;

    const hasProfit = report.summary.totalProfit !== undefined;

    const columns = [
      { key: 'rank', label: '#' },
      { key: 'name', label: t('reports.columns.name') },
      { key: 'secondary', label: t('reports.columns.code') },
      { key: 'ordersCount', label: t('reports.columns.orders') },
      { key: 'quantity', label: t('reports.columns.units') },
      { key: 'revenueSar', label: t('reports.columns.revenueSar') },
      { key: 'netSar', label: t('reports.columns.netSar') },
      { key: 'sharePercent', label: t('reports.columns.share') },
    ];

    if (hasProfit) {
      columns.push(
        { key: 'profitSar', label: t('reports.columns.profitSar') },
        { key: 'marginPercent', label: t('reports.columns.margin') },
      );
    }

    const rows = report.items.map((item) => {
      let secondary = '';
      if (dimension === 'product') secondary = item.sku ?? '';
      else if (dimension === 'staff') secondary = item.email ?? '';
      else if (dimension === 'branch') secondary = item.code ?? '';
      else if (dimension === 'channel') secondary = item.channel ?? '';
      else secondary = item.slug ?? '';

      const r = {
        rank: item.rank,
        name: item.name ?? '',
        secondary,
        ordersCount: item.ordersCount ?? 0,
        quantity: item.quantity ?? 0,
        revenueSar: (Number(item.revenue ?? 0) / 100).toFixed(2),
        netSar: (Number(item.net ?? 0) / 100).toFixed(2),
        sharePercent: `${item.sharePercent ?? 0}%`,
      };

      if (hasProfit) {
        r.profitSar = (Number(item.profit ?? 0) / 100).toFixed(2);
        r.marginPercent = `${item.marginPercent ?? 0}%`;
      }

      return r;
    });

    const filename = `performance_${dimension}_${range}_${new Date().toISOString().slice(0, 10)}`;
    downloadCsv(filename, columns, rows);
  };

  const handleSortChange = (field, dir) => {
    setSortBy(field);
    setSortDir(dir);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('reports.title')}</h1>
        <p className="text-xs text-muted-foreground mt-1">{t('reports.subtitle')}</p>
      </div>

      {/* Primary Section Tabs: Performance vs Forecasting */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('performance')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'performance'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('reports.tabs.performance')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('forecasting')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'forecasting'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('reports.tabs.forecasting')}
        </button>
      </div>

      {activeTab === 'forecasting' ? (
        <ForecastView />
      ) : (
        <>
          {/* Filters (Dimensions, Date Ranges, Branch, Export) */}
          <PerformanceFilters
            dimension={dimension}
            onDimensionChange={(d) => {
              setDimension(d);
              setSortBy('revenue');
              setSortDir('desc');
            }}
            range={range}
            onRangeChange={setRange}
            branchId={branchId}
            onBranchChange={setBranchId}
            onExportCsv={handleExportCsv}
          />

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
              <div className="h-72 rounded-lg bg-muted/40 animate-pulse" />
              <div className="h-80 rounded-lg bg-muted/40 animate-pulse" />
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-xs">
              <p className="font-semibold text-destructive">{t('reports.errorLoading')}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
              >
                {t('reports.retry')}
              </button>
            </div>
          )}

          {/* Content */}
          {!isLoading && !isError && (
            <>
              {/* Summary KPIs */}
              <PerformanceSummaryKpis summary={report.summary} />

              {/* Visual Chart */}
              <PerformanceChart chartData={report.chart} dimension={dimension} />

              {/* Detailed Table */}
              <PerformanceTable
                items={report.items}
                dimension={dimension}
                sortBy={sortBy}
                sortDir={sortDir}
                onSortChange={handleSortChange}
                hasProfit={report.summary?.totalProfit !== undefined}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
export default ReportsPage;
