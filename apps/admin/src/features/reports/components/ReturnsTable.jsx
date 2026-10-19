import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
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

export function ReturnsTable({
  items = [],
  dimension = 'all',
  sortBy = 'refundAmount',
  sortDir = 'desc',
  onSortChange,
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
    if (dimension === 'all') return item.customerName || item.reason || '';
    if (dimension === 'product') return item.sku ?? '';
    if (dimension === 'category') return item.slug ?? '';
    if (dimension === 'staff') return item.email ?? '';
    if (dimension === 'branch') return item.code ?? '';
    if (dimension === 'online' || dimension === 'channel') return item.channel?.toUpperCase() ?? '';
    return '';
  };

  const dimensionTitle = t(`reports.returns.dimensions.${dimension}`, { defaultValue: dimension });

  return (
    <Card className="rounded-lg shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          {t('reports.returns.tableTitle', { dimension: dimensionTitle })}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {t('reports.returns.noData')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-2 font-semibold w-12 text-center">#</th>
                  <th className="py-2.5 px-3">
                    <SortHeader
                      label={t('reports.returns.columns.name')}
                      field="name"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  {dimension === 'all' && (
                    <>
                      <th className="py-2.5 px-3 font-semibold">
                        {t('reports.returns.columns.order')}
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        {t('reports.returns.columns.type')}
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        {t('reports.returns.columns.channel')}
                      </th>
                    </>
                  )}
                  {dimension !== 'all' && (
                    <>
                      <th className="py-2.5 px-3 text-right">
                        <SortHeader
                          label={t('reports.returns.columns.returnsCount')}
                          field="returnsCount"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <SortHeader
                          label={t('reports.returns.columns.exchangesCount')}
                          field="exchangesCount"
                          currentSort={sortBy}
                          currentDir={sortDir}
                          onSort={handleSort}
                        />
                      </th>
                    </>
                  )}
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.returns.columns.returnedUnits')}
                      field="returnedUnits"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <SortHeader
                      label={t('reports.returns.columns.refundAmount')}
                      field="refundAmount"
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                  {(dimension === 'all' ||
                    dimension === 'staff' ||
                    dimension === 'branch' ||
                    dimension === 'online') && (
                    <th className="py-2.5 px-3 text-right">
                      <SortHeader
                        label={t('reports.returns.columns.differenceDue')}
                        field="differenceDue"
                        currentSort={sortBy}
                        currentDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                  )}
                  {dimension !== 'all' && (
                    <th className="py-2.5 px-3 text-right pr-4">
                      <span className="font-semibold">
                        {t('reports.returns.columns.sharePercent')}
                      </span>
                    </th>
                  )}
                  {dimension === 'all' && (
                    <>
                      <th className="py-2.5 px-3 font-semibold">{t('reports.columns.branch')}</th>
                      <th className="py-2.5 px-3 font-semibold pr-4">
                        {t('reports.columns.date')}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, idx) => {
                  const secondary = getSecondaryInfo(item);
                  return (
                    <tr key={item.id ?? idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pl-4 pr-2 font-mono text-2xs text-muted-foreground text-center">
                        {item.rank ?? idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          {secondary && (
                            <span className="text-2xs font-normal text-muted-foreground">
                              {secondary}
                            </span>
                          )}
                        </div>
                      </td>
                      {dimension === 'all' && (
                        <>
                          <td className="py-2.5 px-3">
                            {item.orderNo ? (
                              <Link
                                to={`/orders/${item.orderNo}`}
                                className="text-primary hover:underline font-mono text-2xs"
                              >
                                {item.orderNo}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={`rounded-sm text-2xs px-1.5 py-0 capitalize ${
                                item.type === 'exchange'
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                                  : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {item.type}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 uppercase text-2xs font-semibold text-muted-foreground">
                            {item.channel}
                          </td>
                        </>
                      )}
                      {dimension !== 'all' && (
                        <>
                          <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                            {fmt.number(item.returnsCount ?? 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                            {fmt.number(item.exchangesCount ?? 0)}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-foreground">
                        {fmt.number(item.returnedUnits ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                        {fmt.money(item.refundAmount ?? 0)}
                      </td>
                      {(dimension === 'all' ||
                        dimension === 'staff' ||
                        dimension === 'branch' ||
                        dimension === 'online') && (
                        <td className="py-2.5 px-3 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                          {fmt.money(item.differenceDue ?? 0)}
                        </td>
                      )}
                      {dimension !== 'all' && (
                        <td className="py-2.5 px-3 text-right tabular-nums pr-4 font-medium text-foreground">
                          {item.sharePercent != null ? `${item.sharePercent}%` : '—'}
                        </td>
                      )}
                      {dimension === 'all' && (
                        <>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {item.branchName || '—'}
                          </td>
                          <td className="py-2.5 px-3 pr-4 text-muted-foreground whitespace-nowrap text-2xs">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
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
