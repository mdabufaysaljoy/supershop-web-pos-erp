import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  downloadExportJob,
  useDeleteReportPreset,
  useExportJobs,
  useExportResources,
  useReportPresets,
  useSaveReportPreset,
  useStartExport,
} from '@/features/exports/resource';

const RESOURCES = ['orders', 'products', 'customers', 'inventory', 'performance', 'stockout'];

const STATUS_TONES = {
  queued: 'warning',
  running: 'accent',
  done: 'success',
  failed: 'danger',
};

export function ReportBuilderView({ branchOptions = [] }) {
  const { t } = useTranslation();
  const [selectedResource, setSelectedResource] = useState('orders');
  const [format, setFormat] = useState('xlsx');
  const [reportTitle, setReportTitle] = useState('');
  const [customSelectedColumns, setCustomSelectedColumns] = useState(null);
  const [branchId, setBranchId] = useState('');
  const [presetName, setPresetName] = useState('');

  const { data: resourcesMeta, isLoading: isLoadingMeta } = useExportResources();
  const { data: presets = [] } = useReportPresets(selectedResource);
  const { data: jobsResponse, isFetching: isFetchingJobs } = useExportJobs({
    resource: selectedResource,
    limit: 10,
  });

  const startExport = useStartExport();
  const savePreset = useSaveReportPreset();
  const deletePreset = useDeleteReportPreset();

  const availableColumns = useMemo(() => {
    return resourcesMeta?.[selectedResource] ?? [];
  }, [resourcesMeta, selectedResource]);

  const defaultColumns = useMemo(() => {
    return availableColumns.filter((col) => col.default && col.permitted).map((col) => col.key);
  }, [availableColumns]);

  const selectedColumns = customSelectedColumns ?? defaultColumns;

  const toggleColumn = (key) => {
    setCustomSelectedColumns((prev) => {
      const current = prev ?? defaultColumns;
      return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    });
  };

  const selectAll = () => {
    setCustomSelectedColumns(availableColumns.filter((c) => c.permitted).map((c) => c.key));
  };

  const clearAll = () => {
    setCustomSelectedColumns([]);
  };

  const handleGenerate = async () => {
    const filters = {};
    if (branchId) filters.branchId = branchId;

    await startExport.mutateAsync({
      resource: selectedResource,
      format,
      title: reportTitle.trim() || undefined,
      columns: selectedColumns,
      filters,
    });
  };

  const handleApplyPreset = (p) => {
    if (!p) return;
    if (p.columns && p.columns.length) setCustomSelectedColumns(p.columns);
    if (p.format) setFormat(p.format);
    if (p.filters?.branchId) setBranchId(p.filters.branchId);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    const filters = {};
    if (branchId) filters.branchId = branchId;

    await savePreset.mutateAsync({
      name: presetName.trim(),
      resource: selectedResource,
      columns: selectedColumns,
      format,
      filters,
    });
    setPresetName('');
  };

  const jobs = Array.isArray(jobsResponse) ? jobsResponse : (jobsResponse?.data ?? []);

  return (
    <div className="grid gap-6">
      {/* Studio Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('reports.builder.title')}</CardTitle>
          <CardDescription>{t('reports.builder.description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Step 1: Select Resource */}
          <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              {t('reports.builder.step1')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {RESOURCES.map((resKey) => {
                const isSelected = selectedResource === resKey;
                return (
                  <button
                    key={resKey}
                    type="button"
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                    onClick={() => {
                      setSelectedResource(resKey);
                      setCustomSelectedColumns(null);
                    }}
                  >
                    {t(`export.resources.${resKey}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Presets Bar */}
          {presets.length > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 text-xs border">
              <span className="font-semibold text-muted-foreground uppercase">
                {t('export.presets.label')}:
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 bg-card border rounded px-2.5 py-1"
                  >
                    <button
                      type="button"
                      className="hover:underline font-medium text-foreground"
                      onClick={() => handleApplyPreset(p)}
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-danger"
                      title={t('common.delete')}
                      onClick={() => deletePreset.mutate(p.id)}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Columns Selection */}
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                {t('reports.builder.step2')} ({selectedColumns.length}/{availableColumns.length})
              </Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  {t('export.builder.selectAll')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                  {t('export.builder.clear')}
                </Button>
              </div>
            </div>

            {isLoadingMeta ? (
              <div className="flex justify-center p-8 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin me-2" aria-hidden />
                {t('common.loading')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 border rounded-lg bg-card">
                {availableColumns.map((col) => {
                  const isChecked = selectedColumns.includes(col.key);
                  const isPermitted = col.permitted;

                  return (
                    <label
                      key={col.key}
                      className={`flex items-center gap-2.5 p-2 rounded-md text-xs cursor-pointer select-none transition-colors ${
                        !isPermitted
                          ? 'opacity-40 cursor-not-allowed bg-muted/20'
                          : isChecked
                            ? 'bg-primary/10 text-foreground font-medium border border-primary/20'
                            : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border text-primary focus:ring-primary size-4"
                        checked={isChecked}
                        disabled={!isPermitted}
                        onChange={() => toggleColumn(col.key)}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate">{col.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {col.key}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-1 py-0.5 bg-muted rounded text-muted-foreground">
                        {col.type}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Options (Format, Title, Branch, Presets) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border">
            {/* Format */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                {t('export.form.format')}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'xlsx', label: 'XLSX', icon: FileSpreadsheet },
                  { id: 'csv', label: 'CSV', icon: FileText },
                  { id: 'json', label: 'JSON', icon: FileText },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`flex flex-col items-center justify-center p-2 rounded border text-xs transition-colors ${
                      format === id
                        ? 'border-primary bg-primary text-primary-foreground font-semibold'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setFormat(id)}
                  >
                    <Icon className="size-4 mb-1" aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="grid gap-2">
              <Label
                htmlFor="builder-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                {t('export.form.title')}
              </Label>
              <Input
                id="builder-title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder={`${selectedResource}_report`}
                className="text-xs"
              />
            </div>

            {/* Branch filter if available */}
            {branchOptions.length > 0 && (
              <div className="grid gap-2">
                <Label
                  htmlFor="builder-branch"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  {t('reports.filters.branch')}
                </Label>
                <select
                  id="builder-branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{t('reports.filters.allBranches')}</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {typeof b.name === 'object' ? b.name.en : b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Row: Save preset & Generate */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 max-w-sm flex-1">
              <Input
                placeholder={t('export.presets.savePlaceholder')}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="text-xs h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!presetName.trim() || savePreset.isPending}
                onClick={handleSavePreset}
              >
                <Check className="size-3.5 me-1" aria-hidden />
                {t('export.presets.save')}
              </Button>
            </div>

            <Button
              type="button"
              disabled={selectedColumns.length === 0 || startExport.isPending}
              onClick={handleGenerate}
            >
              {startExport.isPending ? (
                <>
                  <Loader2 className="size-4 me-2 animate-spin" aria-hidden />
                  {t('export.actions.starting')}
                </>
              ) : (
                <>
                  <Download className="size-4 me-2" aria-hidden />
                  {t('reports.builder.generate')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Output & Recent Jobs Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-base">{t('reports.builder.recentReports')}</CardTitle>
            <CardDescription className="text-xs">
              {t('reports.builder.recentReportsDesc')}
            </CardDescription>
          </div>
          {isFetchingJobs && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {t('export.history.empty')}
            </div>
          ) : (
            <div className="divide-y divide-border border rounded-lg overflow-hidden">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-card hover:bg-muted/30 text-xs"
                >
                  <div className="grid gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground font-mono text-xs">
                        {job.fileName}
                      </span>
                      <Badge tone={STATUS_TONES[job.status] ?? 'muted'}>
                        {t(`export.status.${job.status}`)}
                      </Badge>
                      <span className="uppercase font-mono text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground">
                        {job.format}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {t('export.history.meta', {
                        rows: job.counts?.rows ?? 0,
                        date: new Date(job.createdAt).toLocaleString(),
                      })}
                    </span>
                  </div>

                  <div>
                    {job.downloadable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => downloadExportJob(job.id)}
                      >
                        <Download className="size-3.5 me-1 text-primary" aria-hidden />
                        {t('export.actions.download')}
                      </Button>
                    ) : job.status === 'running' || job.status === 'queued' ? (
                      <span className="flex items-center text-accent text-xs font-medium">
                        <RefreshCw className="size-3 me-1 animate-spin" aria-hidden />
                        {t(`export.status.${job.status}`)}
                      </span>
                    ) : (
                      <span className="text-danger text-xs">
                        {job.failure || t('export.status.failed')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
