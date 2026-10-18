import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';

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

export function PerformanceTable({
  items = [],
  dimension = 'product',
  sortBy = 'revenue',
  sortDir = 'desc',
  onSortChange,
  hasProfit = false,
}) {
  const { t } = useTranslation();

  const handleSort = (field) => {
    if (sortBy === field) {
      onSortChange(field, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, 'desc');
    }
  };

  const getSecondaryInfo = (item) => {
    if (dimension === 'product') return item.sku ?? '';
    if (dimension === 'staff') return item.email ?? '';
    if (dimension === 'branch') return item.code ?? '';
    if (dimension === 'channel') return item.channel?.toUpperCase() ?? '';
    return item.slug ?? '';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t('reports.tableTitle', { dimension: t(`reports.dimensions.${dimension}`) })}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {t('reports.noData')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-2 font-semibold w-12 text-center">#</th>
                  <th className="py-2.5 px-3">
                    <SortHeader
                      label={t('reports.columns.name')}
                      field="name"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.columns.orders')}
                      field="orders"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.columns.units')}
                      field="quantity"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.columns.revenue')}
                      field="revenue"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right font-semibold">
                    {t('reports.columns.net')}
                  </th>
                  <th className="py-2.5 px-3 text-right font-semibold w-28">
                    {t('reports.columns.share')}
                  </th>
                  {hasProfit && (
                    <>
                      <th className="py-2.5 px-3 text-right">
                        <SortHeader
                          label={t('reports.columns.profit')}
                          field="profit"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="py-2.5 pr-4 pl-3 text-right font-semibold">
                        {t('reports.columns.margin')}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const secondary = getSecondaryInfo(item);
                  return (
                    <tr key={item.id ?? item.name} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pl-4 pr-2 font-mono text-center text-muted-foreground">
                        {item.rank}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">{item.name || '—'}</div>
                        {secondary && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {secondary}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-foreground">
                        {fmt.number(item.ordersCount ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-foreground">
                        {fmt.number(item.quantity ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                        {fmt.money(item.revenue ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {fmt.money(item.net ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, item.sharePercent ?? 0)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground min-w-[36px]">
                            {item.sharePercent ?? 0}%
                          </span>
                        </div>
                      </td>
                      {hasProfit && (
                        <>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {fmt.money(item.profit ?? 0)}
                          </td>
                          <td className="py-2.5 pr-4 pl-3 text-right font-mono text-muted-foreground">
                            {item.marginPercent ?? 0}%
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
