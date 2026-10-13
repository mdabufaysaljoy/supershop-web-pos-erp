import { PERMISSIONS as P, PRODUCT, PRODUCT_TRANSFER } from '@supershop/shared';
import { ArrowLeft, Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { toast } from 'sonner';
import {
  downloadTemplate,
  useStartExport,
  useStartImport,
  useTransferJob,
  useTransferJobs,
} from '../api';
import { JobResult } from '../components/JobResult';
import { STATUS_TONE } from '../status';

/** Bulk import (CSV/XLSX → validation report) and export of products. */
export function ProductTransferPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [openJobId, setOpenJobId] = useState(null);
  const { data: jobs = [] } = useTransferJobs();
  const { data: openJob } = useTransferJob(openJobId);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <Link
          to="/products"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t('products.title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('transfer.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('transfer.description')}</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {can(P.PRODUCT_IMPORT) && <ImportCard onStarted={setOpenJobId} />}
        {can(P.PRODUCT_EXPORT) && <ExportCard onStarted={setOpenJobId} />}
      </div>

      {openJob && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t(`transfer.jobTitle.${openJob.type}`, { file: openJob.fileName ?? '' })}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobResult job={openJob} />
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('transfer.recent')}</h2>
            </CardTitle>
            <CardDescription>{t('transfer.recentHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transfer.when')}</TableHead>
                  <TableHead>{t('transfer.kind')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('transfer.result')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('transfer.open')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{fmt.dateTime(j.createdAt)}</TableCell>
                    <TableCell>
                      {t(`transfer.jobTitle.${j.type}`, { file: j.fileName ?? '' })}
                      {j.dryRun && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          {t('transfer.import.dryRunBadge')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[j.status]}>{t(`transfer.status.${j.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {j.type === 'import'
                        ? t('transfer.import.short', {
                            created: j.counts.created,
                            updated: j.counts.updated,
                            failed: j.counts.failed,
                          })
                        : t('transfer.export.short', { products: j.counts.products })}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenJobId(j.id)}
                      >
                        {t('transfer.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ImportCard({ onStarted }) {
  const { t } = useTranslation();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [dryRun, setDryRun] = useState(true);
  const start = useStartImport();
  const template = async (format) => {
    try {
      await downloadTemplate(format);
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('transfer.import.title')}</h2>
        </CardTitle>
        <CardDescription>{t('transfer.import.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {PRODUCT_TRANSFER.FORMATS.map((f) => (
            <Button key={f} type="button" variant="outline" size="sm" onClick={() => template(f)}>
              <Download className="size-4" aria-hidden />
              {t('transfer.import.template', { format: f.toUpperCase() })}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            {t('transfer.import.choose')}
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {file?.name ?? t('transfer.import.noFile')}
          </span>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="import-file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('transfer.import.mode')}</span>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PRODUCT_TRANSFER.MODES.map((m) => (
              <option key={m} value={m}>
                {t(`transfer.import.modes.${m}`)}
              </option>
            ))}
          </Select>
        </label>
        <Checkbox
          id="import-dry-run"
          label={t('transfer.import.dryRun')}
          description={t('transfer.import.dryRunHint')}
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        <div>
          <Button
            type="button"
            disabled={!file || start.isPending}
            onClick={() =>
              start.mutate({ file, mode, dryRun }, { onSuccess: (job) => onStarted(job.id) })
            }
          >
            {t(dryRun ? 'transfer.import.validate' : 'transfer.import.start')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('transfer.import.limits')}</p>
      </CardContent>
    </Card>
  );
}

function ExportCard({ onStarted }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState('xlsx');
  const [status, setStatus] = useState('');
  const start = useStartExport();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('transfer.export.title')}</h2>
        </CardTitle>
        <CardDescription>{t('transfer.export.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('transfer.format')}</span>
          <Select value={format} onChange={(e) => setFormat(e.target.value)}>
            {PRODUCT_TRANSFER.FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t('products.form.status')}</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('products.allStatuses')}</option>
            {PRODUCT.STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`products.status.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <div>
          <Button
            type="button"
            disabled={start.isPending}
            onClick={() =>
              start.mutate(
                { format, filters: status ? { status } : {} },
                { onSuccess: (job) => onStarted(job.id) },
              )
            }
          >
            {t('transfer.export.start')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
