import { Building2, Calendar, Download, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventoryBranches } from '@/features/inventory/resource';

export function ForecastFilters({
  strategy,
  onStrategyChange,
  horizon,
  onHorizonChange,
  lookback,
  onLookbackChange,
  branchId,
  onBranchChange,
  onExportCsv,
}) {
  const { t } = useTranslation();
  const { data: branches = [] } = useInventoryBranches();

  const strategies = [
    { id: 'moving_average', label: t('reports.forecast.strategies.movingAverage') },
    { id: 'seasonality', label: t('reports.forecast.strategies.seasonality') },
  ];

  const horizons = [
    { id: '7d', label: t('reports.forecast.horizons.7d') },
    { id: '14d', label: t('reports.forecast.horizons.14d') },
    { id: '30d', label: t('reports.forecast.horizons.30d') },
  ];

  const lookbacks = [
    { id: '14d', label: t('reports.forecast.lookbacks.14d') },
    { id: '30d', label: t('reports.forecast.lookbacks.30d') },
    { id: '60d', label: t('reports.forecast.lookbacks.60d') },
    { id: '90d', label: t('reports.forecast.lookbacks.90d') },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Strategy selector pills */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
        <Sparkles className="ml-1.5 h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium text-muted-foreground mr-1">
          {t('reports.forecast.strategyLabel')}:
        </span>
        {strategies.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStrategyChange(s.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              strategy === s.id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Horizon, Lookback, Branch and Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon pills */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <Calendar className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground mr-1">
              {t('reports.forecast.horizonLabel')}:
            </span>
            {horizons.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onHorizonChange(h.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  horizon === h.id
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Lookback pills */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <span className="text-[11px] font-medium text-muted-foreground ml-2 mr-1">
              {t('reports.forecast.lookbackLabel')}:
            </span>
            {lookbacks.map((lb) => (
              <button
                key={lb.id}
                type="button"
                onClick={() => onLookbackChange(lb.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  lookback === lb.id
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lb.label}
              </button>
            ))}
          </div>
        </div>

        {/* Branch dropdown & Export */}
        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            <div className="relative inline-flex items-center">
              <Building2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={branchId ?? ''}
                onChange={(e) => onBranchChange(e.target.value ? e.target.value : null)}
                className="h-8 rounded-md border bg-background py-1 pl-8 pr-7 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={t('reports.filters.branch')}
              >
                <option value="">{t('reports.filters.allBranches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name?.en ?? b.name ?? b.code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <Download className="h-3.5 w-3.5" />
              {t('reports.filters.exportCsv')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
