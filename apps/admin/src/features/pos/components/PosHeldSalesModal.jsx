import { Clock, PauseCircle, Trash2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fmt } from '@/lib/format';
import { heldSummary } from '../saleStorage';

/**
 * Sales put aside, as a queue (P6.2 revisited): oldest first, because that is the order the
 * counter serves them in. Each one shows who it is for and what it came to, so the cashier can
 * tell two held baskets apart at a glance, and resuming brings the WHOLE sale back — lines,
 * discounts and customer.
 *
 * Whatever is on screen when a held sale is resumed is put aside in its place, never dropped.
 */
export function PosHeldSalesModal({ open, onOpenChange, held = [], onResume, onDrop }) {
  const { t } = useTranslation();
  const entries = held.map(heldSummary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close', 'Close')}>
        <DialogTitle>{t('pos.held.title')}</DialogTitle>
        <DialogDescription>{t('pos.held.description')}</DialogDescription>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('pos.held.empty')}
          </p>
        ) : (
          <ol className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                  {index + 1}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <User className="size-3.5 shrink-0 text-muted-foreground" />
                    {entry.customerName || t('pos.customer.walkin')}
                    {entry.customerPhone && (
                      <span className="font-mono text-[11px] font-normal text-muted-foreground">
                        {entry.customerPhone}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="size-3" aria-hidden />
                    {fmt.dateTime(entry.at, { timeStyle: 'short' })} ·{' '}
                    {t('pos.held.entry', { count: entry.itemCount })}
                    {entry.total > 0 && (
                      <span className="font-medium">· {fmt.money(entry.total)}</span>
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      onResume(entry.id);
                      onOpenChange(false);
                    }}
                  >
                    {t('pos.held.resume')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('pos.held.remove', { customer: entry.customerName || '' })}
                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => onDrop(entry.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The button that opens the queue — it lives beside the payment heading, and counts what waits. */
export function HeldSalesButton({ count, onClick }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant={count > 0 ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className={`h-7 gap-1.5 px-2 text-[11px] font-semibold ${
        count > 0 ? 'bg-amber-600 text-white hover:bg-amber-700' : ''
      }`}
    >
      <PauseCircle className="size-3.5" aria-hidden />
      {t('pos.held.open')}
      {count > 0 && (
        <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold">{count}</span>
      )}
    </Button>
  );
}
