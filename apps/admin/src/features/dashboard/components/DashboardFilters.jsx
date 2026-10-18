import { Building2, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventoryBranches } from '@/features/inventory/resource';

export function DashboardFilters({ range, onRangeChange, branchId, onBranchChange }) {
  const { t } = useTranslation();
  const { data: branches = [] } = useInventoryBranches();

  const ranges = [
    { id: 'today', label: t('dashboard.ranges.today') },
    { id: '7d', label: t('dashboard.ranges.7d') },
    { id: '30d', label: t('dashboard.ranges.30d') },
    { id: '90d', label: t('dashboard.ranges.90d') },
    { id: 'year', label: t('dashboard.ranges.year') },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Date range pills */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
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

      {/* Branch selector */}
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
      </div>
    </div>
  );
}
