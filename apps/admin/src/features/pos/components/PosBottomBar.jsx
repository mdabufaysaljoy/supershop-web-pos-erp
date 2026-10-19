import { CheckCircle2, Pause, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { fmt } from '@/lib/format';

/**
 * Fixed Bottom Action Bar for POS (Non-scrollable workspace layout)
 * Permanently pins:
 * - Clear basket button
 * - Hold this sale button (with held badge & resume trigger)
 * - Complete sale button (with change indicator & total amount)
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
    <footer className="w-full shrink-0 rounded-2xl border border-slate-200/90 bg-white px-5 py-3 shadow-sm flex items-center justify-between gap-4">
      {/* Left Action Controls: Clear Basket & Hold Sale */}
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-destructive hover:border-destructive/30 transition-colors"
          disabled={!lineCount}
          onClick={onClear}
        >
          <Trash2 className="size-3.5 me-1.5 text-slate-400" />
          <span>{t('pos.clear', 'Clear basket')}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 transition-colors"
          disabled={!lineCount && heldCount === 0}
          onClick={lineCount ? onHold : onToggleHeld}
        >
          <Pause className="size-3.5 me-1.5 text-slate-500" />
          <span>{t('pos.held.hold', 'Hold this sale')}</span>
          {heldCount > 0 && (
            <span className="ms-1.5 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              {heldCount}
            </span>
          )}
        </Button>

        {heldCount > 0 && lineCount > 0 && (
          <button
            type="button"
            onClick={onToggleHeld}
            className="text-xs font-semibold text-primary hover:underline ms-1"
          >
            View held ({heldCount})
          </button>
        )}
      </div>

      {/* Right Action Controls: Change Callout & Complete Sale CTA */}
      <div className="flex items-center gap-3">
        {tender.change > 0 && (
          <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 border border-emerald-200 text-xs font-bold text-emerald-800">
            <span>Change to return:</span>
            <span className="tabular-nums font-black text-sm">{fmt.money(tender.change)}</span>
          </div>
        )}

        <Button
          type="button"
          disabled={!canComplete}
          onClick={onComplete}
          className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-md transition-all disabled:opacity-50 min-w-[200px]"
        >
          <CheckCircle2 className="size-4 me-1.5" />
          <span>
            {busy ? t('common.saving', 'Saving...') : t('pos.payment.complete', 'Complete sale')}
          </span>
        </Button>
      </div>
    </footer>
  );
}
