import { STOCK } from '@supershop/shared';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VariantLabel } from '@/components/VariantPicker';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useMovements } from '../resource';
import { Delta } from './Delta';

const PAGE_SIZE = 50;
/** Local calendar day → ISO instant (`to` is exclusive: the next midnight). */
const dayStart = (day, plus = 0) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + plus);
  return d.toISOString();
};

/** The ledger: every stock change with its running balance, newest first. */
export function MovementsTab({ params, go, onDocument }) {
  const { t } = useTranslation();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const branchId = params.get('branchId') ?? '';
  const type = params.get('type') ?? '';
  const variantId = params.get('variantId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const { data, isPending, isError, error } = useMovements({
    page,
    limit: PAGE_SIZE,
    ...(branchId && { branchId }),
    ...(type && { type }),
    ...(variantId && { variantId }),
    ...(from && { from: dayStart(from) }),
    ...(to && { to: dayStart(to, 1) }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));
  const filteredSku = variantId && items[0]?.variant?.sku;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          {t('inventory.type')}
          <Select
            className="w-auto"
            value={type}
            onChange={(e) => go({ type: e.target.value, page: 1 })}
          >
            <option value="">{t('inventory.allTypes')}</option>
            {STOCK.MOVEMENT_TYPES.map((m) => (
              <option key={m} value={m}>
                {t(`inventory.types.${m}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          {t('inventory.from')}
          <input
            type="date"
            dir="ltr"
            className="h-9 rounded border bg-transparent px-2 text-sm"
            value={from}
            onChange={(e) => go({ from: e.target.value, page: 1 })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t('inventory.to')}
          <input
            type="date"
            dir="ltr"
            className="h-9 rounded border bg-transparent px-2 text-sm"
            value={to}
            onChange={(e) => go({ to: e.target.value, page: 1 })}
          />
        </label>
        {variantId && (
          <Button variant="outline" size="sm" onClick={() => go({ variantId: '', page: 1 })}>
            {t('inventory.onlyItem', { sku: filteredSku || '…' })}
            <X className="size-4" aria-label={t('inventory.clearItem')} />
          </Button>
        )}
      </div>
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('inventory.noMovements')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inventory.date')}</TableHead>
              <TableHead>{t('inventory.document')}</TableHead>
              <TableHead>{t('inventory.type')}</TableHead>
              <TableHead>{t('inventory.item')}</TableHead>
              <TableHead>{t('inventory.branch')}</TableHead>
              <TableHead className="text-end">{t('inventory.change')}</TableHead>
              <TableHead className="text-end">{t('inventory.balance')}</TableHead>
              <TableHead>{t('inventory.by')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground">{fmt.dateTime(m.createdAt)}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="font-mono text-xs hover:underline"
                    dir="ltr"
                    onClick={() => onDocument(m.operationId)}
                  >
                    {m.docNo ?? t('inventory.view')}
                  </button>
                </TableCell>
                <TableCell>
                  {t(`inventory.types.${m.type}`)}
                  {m.reason && (
                    <span className="block text-xs text-muted-foreground">
                      {t(`inventory.reasons.${m.reason}`)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-56 max-w-72">
                  <VariantLabel variant={m.variant} />
                </TableCell>
                <TableCell>{m.branch?.code}</TableCell>
                <TableCell className="text-end">
                  <Delta value={m.delta} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{m.balanceAfter}</TableCell>
                <TableCell>{m.actor?.name ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
    </div>
  );
}
