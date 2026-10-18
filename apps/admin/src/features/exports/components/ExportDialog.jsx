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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
} from '../resource';

const FORMAT_ICONS = {
  xlsx: FileSpreadsheet,
  csv: FileText,
  json: FileText,
};

const STATUS_TONES = {
  queued: 'warning',
  running: 'accent',
  done: 'success',
  failed: 'danger',
};

export function ExportDialog({ open, onOpenChange, resource, filters = {}, defaultTitle = '' }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'builder' | 'history'
  const [format, setFormat] = useState('xlsx');
  const [title, setTitle] = useState(defaultTitle);
  const [customSelectedColumns, setCustomSelectedColumns] = useState(null);
  const [presetName, setPresetName] = useState('');

  const { data: resourcesMeta } = useExportResources();
  const { data: presets = [] } = useReportPresets(resource);
  const { data: jobsResponse, isFetching: isFetchingJobs } = useExportJobs({ resource, limit: 10 });
  const startExport = useStartExport();
  const savePreset = useSaveReportPreset();
  const deletePreset = useDeleteReportPreset();

  const availableColumns = useMemo(() => {
    return resourcesMeta?.[resource] ?? [];
  }, [resourcesMeta, resource]);

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

  const selectAllColumns = () => {
    setCustomSelectedColumns(availableColumns.filter((c) => c.permitted).map((c) => c.key));
  };

  const clearColumns = () => {
    setCustomSelectedColumns([]);
  };

  const handleStartExport = async (columnsToUse = null) => {
    await startExport.mutateAsync({
      resource,
      format,
      title: title || undefined,
      columns: columnsToUse ?? (activeTab === 'builder' ? selectedColumns : undefined),
      filters,
    });
    setActiveTab('history');
  };

  const handleApplyPreset = (p) => {
    if (!p) return;
    if (p.columns && p.columns.length) setCustomSelectedColumns(p.columns);
    if (p.format) setFormat(p.format);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    await savePreset.mutateAsync({
      name: presetName.trim(),
      resource,
      columns: selectedColumns,
      format,
      filters,
    });
    setPresetName('');
  };

  const jobs = Array.isArray(jobsResponse) ? jobsResponse : (jobsResponse?.data ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        closeLabel={t('common.close')}
      >
        <DialogTitle className="flex items-center gap-2">
          <Download className="size-5 text-primary" aria-hidden />
          {t('export.dialog.title', { resource: t(`export.resources.${resource}`) })}
        </DialogTitle>
        <DialogDescription>{t('export.dialog.description')}</DialogDescription>

        {/* Tab switcher */}
        <div className="flex border-b border-border text-sm font-medium mt-2">
          <button
            type="button"
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'quick'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('quick')}
          >
            {t('export.tabs.quick')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'builder'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('builder')}
          >
            {t('export.tabs.builder')}
          </button>
          <button
            type="button"
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('history')}
          >
            {t('export.tabs.history')}
            {jobs.length > 0 && (
              <span className="ms-2 px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                {jobs.length}
              </span>
            )}
          </button>
        </div>

        {/* Quick Export Tab */}
        {activeTab === 'quick' && (
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label>{t('export.form.format')}</Label>
              <div className="grid grid-cols-3 gap-3">
                {['xlsx', 'csv', 'json'].map((fmt) => {
                  const Icon = FORMAT_ICONS[fmt];
                  const isSelected = format === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/50 text-foreground'
                      }`}
                      onClick={() => setFormat(fmt)}
                    >
                      <Icon className="size-6 mb-1.5" aria-hidden />
                      <span className="uppercase font-mono">{fmt}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {t(`export.formats.${fmt}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="export-title">{t('export.form.title')}</Label>
              <Input
                id="export-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('export.form.titlePlaceholder', {
                  name: `${resource}_export`,
                })}
              />
            </div>

            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>{t('export.dialog.filterNotice')}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={startExport.isPending}
                onClick={() => handleStartExport(null)}
              >
                {startExport.isPending ? (
                  <>
                    <Loader2 className="size-4 me-2 animate-spin" aria-hidden />
                    {t('export.actions.starting')}
                  </>
                ) : (
                  <>
                    <Download className="size-4 me-2" aria-hidden />
                    {t('export.actions.start')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Report Builder Tab */}
        {activeTab === 'builder' && (
          <div className="grid gap-5 py-4">
            {/* Presets Bar */}
            {presets.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase px-1">
                  {t('export.presets.label')}:
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-1 bg-card border rounded px-2 py-1 text-xs"
                    >
                      <button
                        type="button"
                        className="hover:underline font-medium"
                        onClick={() => handleApplyPreset(p)}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-danger ms-1"
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

            {/* Format row */}
            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-1">
                <Label>{t('export.form.format')}</Label>
                <div className="flex gap-2">
                  {['xlsx', 'csv', 'json'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className={`px-3 py-1 rounded text-xs uppercase font-mono border transition-colors ${
                        format === fmt
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                      onClick={() => setFormat(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Button type="button" variant="outline" size="sm" onClick={selectAllColumns}>
                  {t('export.builder.selectAll')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearColumns}>
                  {t('export.builder.clear')}
                </Button>
              </div>
            </div>

            {/* Column selection checklist */}
            <div className="grid gap-2">
              <Label className="flex justify-between items-center">
                <span>{t('export.builder.columns')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t('export.builder.selectedCount', {
                    count: selectedColumns.length,
                    total: availableColumns.length,
                  })}
                </span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border rounded-md">
                {availableColumns.map((col) => {
                  const isChecked = selectedColumns.includes(col.key);
                  const isPermitted = col.permitted;

                  return (
                    <label
                      key={col.key}
                      className={`flex items-center gap-2.5 p-2 rounded text-xs cursor-pointer select-none transition-colors ${
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
            </div>

            {/* Save preset form */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={selectedColumns.length === 0 || startExport.isPending}
                onClick={() => handleStartExport(selectedColumns)}
              >
                {startExport.isPending ? (
                  <>
                    <Loader2 className="size-4 me-2 animate-spin" aria-hidden />
                    {t('export.actions.starting')}
                  </>
                ) : (
                  <>
                    <Download className="size-4 me-2" aria-hidden />
                    {t('export.actions.generateReport')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="grid gap-3 py-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
              <span>{t('export.history.description')}</span>
              {isFetchingJobs && (
                <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
              )}
            </div>

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

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
