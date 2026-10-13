import { PERMISSIONS as P } from '@supershop/shared';
import { useBarcodeScanner } from '@supershop/ui';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useLevels } from '../resource';

const PAGE_SIZE = 50;

/** Stock per item and branch: search (or scan), low-stock filter, row actions. */
export function LevelsTab({ params, go, onAdjust, onThreshold, onHistory }) {
  const { t } = useTranslation();
  const can = useCan();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const low = params.get('low') === 'true';
  const branchId = params.get('branchId') ?? '';
  // Scanning a barcode anywhere outside a text field searches for it.
  useBarcodeScanner({ onScan: (code) => go({ q: code, page: 1 }) });
  const { data, isPending, isError, error } = useLevels({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(low && { low: true }),
    ...(branchId && { branchId }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));
  const canAdjust = can(P.INVENTORY_ADJUST);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <SearchForm
          key={q}
          initial={q}
          label={t('inventory.search')}
          onSearch={(v) => go({ q: v, page: 1 })}
        />
        <Checkbox
          id="low-only"
          label={t('inventory.lowOnly')}
          checked={low}
          onChange={(e) => go({ low: e.target.checked ? 'true' : '', page: 1 })}
        />
      </div>
      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('inventory.noLevels')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inventory.item')}</TableHead>
              <TableHead>{t('inventory.branch')}</TableHead>
              <TableHead className="text-end">{t('inventory.onHand')}</TableHead>
              <TableHead className="text-end">{t('inventory.lowLevel')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('inventory.lastMovement')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('inventory.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="min-w-56 max-w-80">
                  <VariantLabel variant={l.variant} />
                </TableCell>
                <TableCell>{l.branch?.code}</TableCell>
                <TableCell className="text-end text-base font-medium tabular-nums">
                  {l.onHand}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {l.threshold}
                  {l.lowStockThreshold == null && (
                    <span className="ms-1 text-xs text-muted-foreground">
                      {t('inventory.default')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge tone={l.isOut ? 'bad' : l.isLow ? 'warn' : 'ok'}>
                    {t(l.isOut ? 'inventory.out' : l.isLow ? 'inventory.low' : 'inventory.inStock')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {l.lastMovementAt ? fmt.dateTime(l.lastMovementAt) : '—'}
                </TableCell>
                <TableCell>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onHistory(l)}
                      aria-label={t('inventory.historyFor', {
                        sku: l.variant?.sku,
                        branch: l.branch?.code,
                      })}
                    >
                      {t('inventory.history')}
                    </Button>
                    {canAdjust && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAdjust(l)}
                          aria-label={t('inventory.adjustFor', {
                            sku: l.variant?.sku,
                            branch: l.branch?.code,
                          })}
                        >
                          {t('inventory.adjust')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onThreshold(l)}
                          aria-label={t('inventory.thresholdFor', {
                            sku: l.variant?.sku,
                            branch: l.branch?.code,
                          })}
                        >
                          {t('inventory.lowLevel')}
                        </Button>
                      </>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
    </div>
  );
}
