import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useOperation } from '../resource';
import { Delta } from './Delta';

/** A stock document (receipt, adjustment, transfer…) with all its ledger rows. */
export function OperationDialog({ operationId, onClose }) {
  const { t } = useTranslation();
  const { data: op, isPending, isError, error } = useOperation(operationId);
  return (
    <Dialog open={Boolean(operationId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
        <DialogTitle className="pe-8">
          {op ? (op.docNo ?? t(`inventory.operations.${op.type}`)) : t('inventory.document')}
        </DialogTitle>
        {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
        {isPending ? (
          <Skeleton className="h-32" />
        ) : op ? (
          <div className="grid gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('inventory.type')}</dt>
              <dd>
                {t(`inventory.operations.${op.type}`)}
                {op.reason && ` · ${t(`inventory.reasons.${op.reason}`)}`}
              </dd>
              <dt className="text-muted-foreground">{t('inventory.date')}</dt>
              <dd>{fmt.dateTime(op.createdAt)}</dd>
              <dt className="text-muted-foreground">{t('inventory.branch')}</dt>
              <dd>
                {op.branch?.code}
                {op.toBranch && ` → ${op.toBranch.code}`}
              </dd>
              {op.actor && (
                <>
                  <dt className="text-muted-foreground">{t('inventory.by')}</dt>
                  <dd>{op.actor.name}</dd>
                </>
              )}
              {op.reference && (
                <>
                  <dt className="text-muted-foreground">{t('inventory.reference')}</dt>
                  <dd>{op.reference}</dd>
                </>
              )}
              {op.refType === 'purchaseOrder' && (
                <>
                  <dt className="text-muted-foreground">{t('inventory.source')}</dt>
                  <dd>
                    <Link className="underline" to={`/purchase-orders/${op.refId}`}>
                      {t('inventory.purchaseOrder')}
                    </Link>
                  </dd>
                </>
              )}
              {op.note && (
                <>
                  <dt className="text-muted-foreground">{t('inventory.note')}</dt>
                  <dd className="whitespace-pre-wrap">{op.note}</dd>
                </>
              )}
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.item')}</TableHead>
                  <TableHead>{t('inventory.branch')}</TableHead>
                  <TableHead className="text-end">{t('inventory.change')}</TableHead>
                  <TableHead className="text-end">{t('inventory.balance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {op.movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <VariantLabel variant={m.variant} />
                    </TableCell>
                    <TableCell>{m.branch?.code}</TableCell>
                    <TableCell className="text-end">
                      <Delta value={m.delta} />
                      {m.countedQty != null && (
                        <span className="block text-xs text-muted-foreground">
                          {t('inventory.counted', { count: m.countedQty })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{m.balanceAfter}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
