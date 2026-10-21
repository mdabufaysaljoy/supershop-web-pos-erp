import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadCsv } from '../csvExport';
import { useSalesForecast, useStockoutForecast } from '../resource';
import { ForecastFilters } from './ForecastFilters';
import { ForecastKpis } from './ForecastKpis';
import { SalesForecastChart } from './SalesForecastChart';
import { StockoutTable } from './StockoutTable';

export function ForecastView() {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState('moving_average');
  const [horizon, setHorizon] = useState('14d');
  const [lookback, setLookback] = useState('30d');
  const [branchId, setBranchId] = useState(null);

  // Stockout table state
  const [risk, setRisk] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('daysRemaining');
  const [sortDir, setSortDir] = useState('asc');

  const {
    data: salesData,
    isLoading: isSalesLoading,
    isError: isSalesError,
    refetch: refetchSales,
  } = useSalesForecast({
    strategy,
    horizon,
    lookback,
    branchId,
  });

  const {
    data: stockoutData,
    isLoading: isStockoutLoading,
    isError: isStockoutError,
    refetch: refetchStockout,
  } = useStockoutForecast({
    lookback,
    branchId,
    risk,
    search,
    sortBy,
    sortDir,
    limit: 100,
  });

  const handleExportSalesCsv = () => {
    if (!salesData?.forecast?.length) return;

    const columns = [
      { key: 'date', label: t('reports.columns.date') },
      { key: 'type', label: t('reports.columns.type') },
      { key: 'quantity', label: t('reports.columns.units') },
      { key: 'revenueSar', label: t('reports.columns.revenueSar') },
      { key: 'lowerQty', label: 'Lower Bound (Units)' },
      { key: 'upperQty', label: 'Upper Bound (Units)' },
      { key: 'lowerRevSar', label: 'Lower Bound (SAR)' },
      { key: 'upperRevSar', label: 'Upper Bound (SAR)' },
    ];

    const rows = [
      ...(salesData.historical ?? []).map((h) => ({
        date: h.date,
        type: 'Actual',
        quantity: h.quantity,
        revenueSar: (Number(h.revenue ?? 0) / 100).toFixed(2),
        lowerQty: '—',
        upperQty: '—',
        lowerRevSar: '—',
        upperRevSar: '—',
      })),
      ...(salesData.forecast ?? []).map((f) => ({
        date: f.date,
        type: 'Forecast',
        quantity: f.quantity,
        revenueSar: (Number(f.revenue ?? 0) / 100).toFixed(2),
        lowerQty: f.lowerQuantity,
        upperQty: f.upperQuantity,
        lowerRevSar: (Number(f.lowerRevenue ?? 0) / 100).toFixed(2),
        upperRevSar: (Number(f.upperRevenue ?? 0) / 100).toFixed(2),
      })),
    ];

    const filename = `sales_forecast_${strategy}_${horizon}_${new Date().toISOString().slice(0, 10)}`;
    downloadCsv(filename, columns, rows);
  };

  const isLoading = isSalesLoading || isStockoutLoading;
  const isError = isSalesError || isStockoutError;

  return (
    <div className="space-y-6">
      {/* Filters (Strategy, Horizon, Lookback, Branch, Export) */}
      <ForecastFilters
        strategy={strategy}
        onStrategyChange={setStrategy}
        horizon={horizon}
        onHorizonChange={setHorizon}
        lookback={lookback}
        onLookbackChange={setLookback}
        branchId={branchId}
        onBranchChange={setBranchId}
        onExportCsv={handleExportSalesCsv}
      />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded bg-muted/40 animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded bg-muted/40 animate-pulse" />
          <div className="h-64 rounded bg-muted/40 animate-pulse" />
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="rounded border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          <p className="font-semibold">{t('reports.errorTitle')}</p>
          <p className="mt-1">{t('reports.errorMessage')}</p>
          <button
            type="button"
            onClick={() => {
              refetchSales();
              refetchStockout();
            }}
            className="mt-3 rounded bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
          >
            {t('reports.retry')}
          </button>
        </div>
      )}

      {/* Main Content */}
      {!isLoading && !isError && (
        <>
          {/* KPI Cards */}
          <ForecastKpis summary={salesData?.summary} />

          {/* Sales Forecast Recharts Chart */}
          <SalesForecastChart historical={salesData?.historical} forecast={salesData?.forecast} />

          {/* Stockout Risk Table */}
          <StockoutTable
            items={stockoutData?.items}
            summary={stockoutData?.summary}
            risk={risk}
            onRiskChange={setRisk}
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={(field, dir) => {
              setSortBy(field);
              setSortDir(dir);
            }}
          />
        </>
      )}
    </div>
  );
}
