import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Download,
  PackageX,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';
import { downloadCsv } from '../csvExport';

function SortHeader({ label, field, currentSort, currentDir, onSort }) {
  const isActive = currentSort === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      {isActive ? (
        currentDir === 'asc' ? (
          <ArrowUp className="h-3 w-3 text-primary" />
        ) : (
          <ArrowDown className="h-3 w-3 text-primary" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function StockoutTable({
  items = [],
  summary = {},
  risk = 'all',
  onRiskChange,
  search = '',
  onSearchChange,
  sortBy = 'daysRemaining',
  sortDir = 'asc',
  onSortChange,
}) {
  const { t } = useTranslation();

  const handleSort = (field) => {
    if (sortBy === field) {
      onSortChange(field, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, field === 'daysRemaining' ? 'asc' : 'desc');
    }
  };

  const riskFilters = [
    { id: 'all', label: t('reports.stockout.risks.all'), count: summary.totalTracked ?? 0 },
    {
      id: 'out_of_stock',
      label: t('reports.stockout.risks.outOfStock'),
      count: summary.outOfStockCount ?? 0,
      color: 'text-rose-600',
    },
    {
      id: 'critical',
      label: t('reports.stockout.risks.critical'),
      count: summary.criticalCount ?? 0,
      color: 'text-orange-600',
    },
    {
      id: 'warning',
      label: t('reports.stockout.risks.warning'),
      count: summary.warningCount ?? 0,
      color: 'text-amber-600',
    },
    {
      id: 'healthy',
      label: t('reports.stockout.risks.healthy'),
      count: summary.healthyCount ?? 0,
      color: 'text-emerald-600',
    },
  ];

  const handleExportCsv = () => {
    if (!items.length) return;

    const columns = [
      { key: 'productName', label: t('reports.columns.name') },
      { key: 'variantLabel', label: t('reports.stockout.columns.variant') },
      { key: 'sku', label: t('reports.columns.code') },
      { key: 'branchName', label: t('reports.columns.branch') },
      { key: 'onHand', label: t('reports.stockout.columns.onHand') },
      { key: 'dailyVelocity', label: t('reports.stockout.columns.dailyVelocity') },
      { key: 'daysRemaining', label: t('reports.stockout.columns.daysRemaining') },
      { key: 'riskLevel', label: t('reports.stockout.columns.risk') },
      { key: 'estimatedStockoutDate', label: t('reports.stockout.columns.estimatedDate') },
      { key: 'recommendedReorderQty', label: t('reports.stockout.columns.recommendedReorder') },
    ];

    const rows = items.map((i) => ({
      productName: i.productName ?? '',
      variantLabel: i.variantLabel ?? '',
      sku: i.sku ?? '',
      branchName: i.branchName ?? 'All Branches',
      onHand: i.onHand ?? 0,
      dailyVelocity: i.dailyVelocity ?? 0,
      daysRemaining: i.daysRemaining != null ? `${i.daysRemaining} days` : 'No Depletion',
      riskLevel: i.riskLevel,
      estimatedStockoutDate: i.estimatedStockoutDate ? i.estimatedStockoutDate.slice(0, 10) : '—',
      recommendedReorderQty: i.recommendedReorderQty ?? 0,
    }));

    const filename = `stockout_forecast_${new Date().toISOString().slice(0, 10)}`;
    downloadCsv(filename, columns, rows);
  };

  const getRiskBadge = (item) => {
    switch (item.riskLevel) {
      case 'out_of_stock':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
            <PackageX className="h-3 w-3" />
            {t('reports.stockout.badges.outOfStock')}
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
            <AlertCircle className="h-3 w-3" />
            {item.daysRemaining != null ? `${item.daysRemaining}d` : ''}{' '}
            {t('reports.stockout.badges.critical')}
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {item.daysRemaining != null ? `${item.daysRemaining}d` : ''}{' '}
            {t('reports.stockout.badges.warning')}
          </span>
        );
      case 'healthy':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {item.daysRemaining != null
              ? `${item.daysRemaining}d`
              : t('reports.stockout.badges.healthy')}
          </span>
        );
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">
            {t('reports.stockout.tableTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('reports.stockout.tableSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('reports.stockout.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 w-44 sm:w-56 rounded-md border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!items.length}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t('reports.filters.exportCsv')}
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Risk Level Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
          {riskFilters.map((rf) => (
            <button
              key={rf.id}
              type="button"
              onClick={() => onRiskChange(rf.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                risk === rf.id
                  ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{rf.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  risk === rf.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : rf.color || 'bg-background text-foreground'
                }`}
              >
                {rf.count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        {!items.length ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            {t('reports.stockout.noItems')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3">
                    <SortHeader
                      label={t('reports.columns.name')}
                      field="name"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">{t('reports.columns.code')}</th>
                  <th className="py-2.5 px-3">{t('reports.columns.branch')}</th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.stockout.columns.onHand')}
                      field="onHand"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.stockout.columns.dailyVelocity')}
                      field="dailyVelocity"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">
                    <SortHeader
                      label={t('reports.stockout.columns.daysRemaining')}
                      field="daysRemaining"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3">{t('reports.stockout.columns.estimatedDate')}</th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.stockout.columns.recommendedReorder')}
                      field="recommendedReorderQty"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr
                    key={`${item.variantId}-${item.branchId || 'all'}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      <div>{item.productName || '—'}</div>
                      {item.variantLabel && (
                        <div className="text-[11px] text-muted-foreground">{item.variantLabel}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                      {item.sku}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {item.branchName || t('reports.filters.allBranches')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                      {fmt.number(item.onHand)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                      {item.dailyVelocity} /d
                    </td>
                    <td className="py-2.5 px-3">{getRiskBadge(item)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {item.estimatedStockoutDate
                        ? fmt.date(item.estimatedStockoutDate)
                        : t('reports.stockout.noDepletion')}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.recommendedReorderQty > 0 ? (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          +{fmt.number(item.recommendedReorderQty)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
