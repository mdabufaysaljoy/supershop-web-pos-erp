import { CheckCircle2, Pause, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/format';

/**
 * POS sale actions, pinned at the bottom of the Payment column:
 * - Complete sale button (full width, with change indicator)
 * - Clear basket & Hold this sale side by side; the queue of held sales has its own button
 *   beside the payment heading, and a link here when any are waiting.
 */
export function PosBottomBar({
  lineCount = 0,
  tender,
  busy = false,
  blocked = false,
  payments = [],
  onClear,
  onHold,
  onComplete,
  heldCount = 0,
  onToggleHeld,
}) {
  const { t } = useTranslation();

  const canComplete = !busy && !blocked && payments.length > 0 && tender.due <= 0;

  return (
    <div className="shrink-0 flex flex-col gap-2 pt-3 mt-2 border-t border-slate-100">
      {tender.change > 0 && (
        <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-1.5 border border-emerald-200 text-xs font-bold text-emerald-800">
          <span>{t('pos.payment.change', 'Change')}</span>
          <span className="tabular-nums font-black text-sm">{fmt.money(tender.change)}</span>
        </div>
      )}

      <Button
        type="button"
        disabled={!canComplete}
        onClick={onComplete}
        className="h-11 w-full rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-md transition-all disabled:opacity-50"
      >
        <CheckCircle2 className="size-4 me-1.5" />
        <span>
          {busy ? t('common.saving', 'Saving...') : t('pos.payment.complete', 'Complete sale')}
        </span>
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2 rounded-md text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-destructive hover:border-destructive/30 transition-colors"
          disabled={!lineCount}
          onClick={onClear}
        >
          <Trash2 className="size-3.5 me-1 text-slate-400 shrink-0" />
          <span className="truncate">{t('pos.clear', 'Clear basket')}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2 rounded-md text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 transition-colors"
          disabled={!lineCount}
          onClick={onHold}
        >
          <Pause className="size-3.5 me-1 text-slate-500 shrink-0" />
          <span className="truncate">{t('pos.held.hold', 'Hold this sale')}</span>
        </Button>
      </div>

      {heldCount > 0 && (
        <button
          type="button"
          onClick={onToggleHeld}
          className="self-center text-xs font-semibold text-primary hover:underline"
        >
          {t('pos.held.openCount', { count: heldCount })}
        </button>
      )}
    </div>
  );
}
