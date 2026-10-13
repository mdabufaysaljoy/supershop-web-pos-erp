import { STOCK } from '@supershop/shared';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useOperations } from '../resource';

const PAGE_SIZE = 50;

/** Stock documents: receipts, adjustments, counts, transfers (sales/returns come from orders). */
export function DocumentsTab({ params, go, onDocument }) {
  const { t } = useTranslation();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const branchId = params.get('branchId') ?? '';
  const type = params.get('opType') ?? '';
  const { data, isPending, isError, error } = useOperations({
    page,
    limit: PAGE_SIZE,
    ...(branchId && { branchId }),
    ...(type && { type }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <label className="grid w-fit gap-1 text-sm">
        {t('inventory.type')}
        <Select
          className="w-auto"
          value={type}
          onChange={(e) => go({ opType: e.target.value, page: 1 })}
        >
          <option value="">{t('inventory.allTypes')}</option>
          {STOCK.OPERATION_TYPES.map((o) => (
            <option key={o} value={o}>
              {t(`inventory.operations.${o}`)}
            </option>
          ))}
        </Select>
      </label>
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('inventory.noDocuments')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inventory.document')}</TableHead>
              <TableHead>{t('inventory.date')}</TableHead>
              <TableHead>{t('inventory.type')}</TableHead>
              <TableHead>{t('inventory.branch')}</TableHead>
              <TableHead className="text-end">{t('inventory.lines')}</TableHead>
              <TableHead>{t('inventory.by')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs font-medium hover:underline"
                    dir="ltr"
                    onClick={() => onDocument(o.id)}
                  >
                    {o.docNo ?? t('inventory.view')}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{fmt.dateTime(o.createdAt)}</TableCell>
                <TableCell>
                  {t(`inventory.operations.${o.type}`)}
                  {o.reason && (
                    <span className="block text-xs text-muted-foreground">
                      {t(`inventory.reasons.${o.reason}`)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {o.branch?.code}
                  {o.toBranch && ` → ${o.toBranch.code}`}
                </TableCell>
                <TableCell className="text-end tabular-nums">{o.lineCount}</TableCell>
                <TableCell>{o.actor?.name ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
    </div>
  );
}
