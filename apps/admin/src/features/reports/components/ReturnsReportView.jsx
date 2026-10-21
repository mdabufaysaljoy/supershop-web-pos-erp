import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadCsv } from '../csvExport';
import { useReturnsReport } from '../resource';
import { ReturnsChart } from './ReturnsChart';
import { ReturnsFilters } from './ReturnsFilters';
import { ReturnsSummaryKpis } from './ReturnsSummaryKpis';
import { ReturnsTable } from './ReturnsTable';

export function ReturnsReportView() {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState('all');
  const [range, setRange] = useState('7d');
  const [branchId, setBranchId] = useState(null);
  const [channel, setChannel] = useState('all');
  const [sortBy, setSortBy] = useState('refundAmount');
  const [sortDir, setSortDir] = useState('desc');

  const { data, isLoading, isError, refetch } = useReturnsReport({
    dimension,
    range,
    branchId,
    channel,
    limit: 100,
    sortBy,
    sortDir,
  });

  const report = data ?? {
    summary: {},
    items: [],
    chart: [],
  };

  const handleExportCsv = () => {
    if (!report.items?.length) return;

    const columns = [
      { key: 'rank', label: '#' },
      { key: 'name', label: t('reports.returns.columns.name') },
      { key: 'secondary', label: t('reports.returns.columns.secondary') },
    ];

    if (dimension === 'all') {
      columns.push(
        { key: 'type', label: t('reports.returns.columns.type') },
        { key: 'channel', label: t('reports.returns.columns.channel') },
      );
    } else {
      columns.push(
        { key: 'returnsCount', label: t('reports.returns.columns.returnsCount') },
        { key: 'exchangesCount', label: t('reports.returns.columns.exchangesCount') },
      );
    }

    columns.push(
      { key: 'returnedUnits', label: t('reports.returns.columns.returnedUnits') },
      { key: 'refundAmountSar', label: t('reports.returns.columns.refundAmount') },
      { key: 'differenceDueSar', label: t('reports.returns.columns.differenceDue') },
    );

    if (dimension !== 'all') {
      columns.push({ key: 'sharePercent', label: t('reports.returns.columns.sharePercent') });
    }

    const rows = report.items.map((item) => {
      let secondary = '';
      if (dimension === 'all') secondary = item.orderNo ?? '';
      else if (dimension === 'product') secondary = item.sku ?? '';
      else if (dimension === 'category') secondary = item.slug ?? '';
      else if (dimension === 'staff') secondary = item.email ?? '';
      else if (dimension === 'branch') secondary = item.code ?? '';
      else if (dimension === 'online') secondary = item.channel ?? '';

      return {
        rank: item.rank,
        name: item.name ?? '',
        secondary,
        type: item.type ?? '',
        channel: item.channel ?? '',
        returnsCount: item.returnsCount ?? 0,
        exchangesCount: item.exchangesCount ?? 0,
        returnedUnits: item.returnedUnits ?? 0,
        refundAmountSar: (Number(item.refundAmount ?? 0) / 100).toFixed(2),
        differenceDueSar: (Number(item.differenceDue ?? 0) / 100).toFixed(2),
        sharePercent: item.sharePercent != null ? `${item.sharePercent}%` : '',
      };
    });

    const filename = `returns_report_${dimension}_${range}_${new Date().toISOString().slice(0, 10)}`;
    downloadCsv(filename, columns, rows);
  };

  const handleSortChange = (field, dir) => {
    setSortBy(field);
    setSortDir(dir);
  };

  return (
    <div className="space-y-6">
      {/* Dimension and Filter Controls */}
      <ReturnsFilters
        dimension={dimension}
        onDimensionChange={(d) => {
          setDimension(d);
          setSortBy('refundAmount');
          setSortDir('desc');
        }}
        range={range}
        onRangeChange={setRange}
        branchId={branchId}
        onBranchChange={setBranchId}
        channel={channel}
        onChannelChange={setChannel}
        onExportCsv={handleExportCsv}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded bg-muted/40 animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded bg-muted/40 animate-pulse" />
          <div className="h-80 rounded bg-muted/40 animate-pulse" />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded border border-destructive/20 bg-destructive/5 p-6 text-center text-xs">
          <p className="font-semibold text-destructive">{t('reports.returns.errorLoading')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
          >
            {t('reports.retry')}
          </button>
        </div>
      )}

      {/* Report Content */}
      {!isLoading && !isError && (
        <>
          {/* Executive KPI Cards */}
          <ReturnsSummaryKpis summary={report.summary} />

          {/* Visual Chart */}
          <ReturnsChart chartData={report.chart} dimension={dimension} />

          {/* Detailed Data Table */}
          <ReturnsTable
            items={report.items}
            dimension={dimension}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
          />
        </>
      )}
    </div>
  );
}
