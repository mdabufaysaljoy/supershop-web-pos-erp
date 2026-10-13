import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fieldMessage } from '@/lib/i18n';
import { downloadExport } from '../api';
import { STATUS_TONE } from '../status';

/** Client-side CSV of the validation report (row, column, message) for fixing in Excel. */
function reportCsv(errors, t) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    [t('transfer.report.row'), t('transfer.report.column'), t('transfer.report.problem')]
      .map(q)
      .join(','),
  ];
  for (const e of errors)
    lines.push([e.row, e.column, fieldMessage(t, e.message) ?? e.message].map(q).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Progress, counts, ignored columns and the row-level report of one job. */
export function JobResult({ job }) {
  const { t } = useTranslation();
  const running = job.status === 'queued' || job.status === 'running';
  const c = job.counts;
  const saveReport = () => {
    const url = URL.createObjectURL(
      new Blob([reportCsv(job.errors ?? [], t)], { type: 'text/csv' }),
    );
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: 'import-report.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[job.status]}>{t(`transfer.status.${job.status}`)}</Badge>
        {job.dryRun && <Badge>{t('transfer.import.dryRunBadge')}</Badge>}
        {running && c.products > 0 && (
          <span className="text-sm text-muted-foreground">
            {t('transfer.progress', { done: c.processed, total: c.products })}
          </span>
        )}
      </div>
      {job.failure && <Alert variant="destructive">{t(job.failure)}</Alert>}
      {job.status === 'done' && job.type === 'import' && (
        <p className="text-sm">
          {t(job.dryRun ? 'transfer.import.summaryDry' : 'transfer.import.summary', {
            created: c.created,
            updated: c.updated,
            failed: c.failed,
            rows: c.rows,
          })}
        </p>
      )}
      {job.status === 'done' && job.type === 'export' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {t('transfer.export.summary', { products: c.products, rows: c.rows })}
          </p>
          {job.downloadable && (
            <Button type="button" onClick={() => downloadExport(job.id)}>
              <Download className="size-4" aria-hidden />
              {t('transfer.export.download')}
            </Button>
          )}
        </div>
      )}
      {job.ignoredColumns?.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('transfer.import.ignored', { columns: job.ignoredColumns.join(', ') })}
        </p>
      )}
      {job.errors?.length > 0 && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {t('transfer.report.title', { count: job.errorCount })}
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={saveReport}>
              <Download className="size-4" aria-hidden />
              {t('transfer.report.download')}
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transfer.report.row')}</TableHead>
                  <TableHead>{t('transfer.report.column')}</TableHead>
                  <TableHead>{t('transfer.report.problem')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.errors.map((e, i) => (
                  <TableRow key={`${e.row}-${e.column}-${i}`}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell className="font-mono text-xs">{e.column}</TableCell>
                    <TableCell className="whitespace-normal">
                      {fieldMessage(t, e.message) ?? e.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {job.errorCount > job.errors.length && (
            <p className="text-xs text-muted-foreground">
              {t('transfer.report.truncated', { shown: job.errors.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
