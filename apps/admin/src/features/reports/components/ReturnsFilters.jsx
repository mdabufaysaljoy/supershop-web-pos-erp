import { Building2, Calendar, Download, Layers, MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventoryBranches } from '@/features/inventory/resource';

export function ReturnsFilters({
  dimension,
  onDimensionChange,
  range,
  onRangeChange,
  branchId,
  onBranchChange,
  channel,
  onChannelChange,
  onExportCsv,
}) {
  const { t } = useTranslation();
  const { data: branches = [] } = useInventoryBranches();

  const dimensions = [
    { id: 'all', label: t('reports.returns.dimensions.all') },
    { id: 'product', label: t('reports.returns.dimensions.product') },
    { id: 'category', label: t('reports.returns.dimensions.category') },
    { id: 'staff', label: t('reports.returns.dimensions.staff') },
    { id: 'branch', label: t('reports.returns.dimensions.branch') },
    { id: 'online', label: t('reports.returns.dimensions.online') },
  ];

  const ranges = [
    { id: 'today', label: t('dashboard.ranges.today') },
    { id: '7d', label: t('dashboard.ranges.7d') },
    { id: '30d', label: t('dashboard.ranges.30d') },
    { id: '90d', label: t('dashboard.ranges.90d') },
    { id: 'year', label: t('dashboard.ranges.year') },
  ];

  const channels = [
    { id: 'all', label: t('reports.returns.channels.all') },
    { id: 'pos', label: t('reports.returns.channels.pos') },
    { id: 'online', label: t('reports.returns.channels.online') },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Dimension tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
        <Layers className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
        {dimensions.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onDimensionChange(d.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              dimension === d.id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Date range, channel, branch and export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1">
            <Calendar className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            {ranges.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRangeChange(r.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r.id
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Channel selector */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            <MonitorSmartphone className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChannelChange(c.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  channel === c.id
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Branch selector & CSV export */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Building2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={branchId ?? ''}
              onChange={(e) => onBranchChange(e.target.value || null)}
              aria-label={t('dashboard.allBranches')}
              className="h-8 rounded-lg border bg-background pl-8 pr-3 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t('dashboard.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-muted/60"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{t('reports.returns.exportCsv')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
