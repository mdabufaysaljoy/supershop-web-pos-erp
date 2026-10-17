import { PERMISSIONS as P } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CashMovementDialog,
  CloseShiftDialog,
  OpenShiftDialog,
  ShiftReportDialog,
} from '@/features/shifts/components/ShiftDialogs';
import { useCurrentShift } from '@/features/shifts/resource';
import { fmt } from '@/lib/format';
import { useCan } from '@/lib/permissions';

/**
 * Compact shift strip at the top of the till (P6.5): lets the cashier open their drawer, record
 * paid-in/paid-out cash, check the X-report, or count and close the shift without leaving the till.
 */
export function ShiftBar({ branchId }) {
  const { t } = useTranslation();
  const can = useCan();
  const canView = can(P.SHIFT_VIEW);
  const canOpen = can(P.SHIFT_OPEN);
  const canClose = can(P.SHIFT_CLOSE);
  const canMoveCash = can(P.SHIFT_CASH_MOVEMENT);
  const hasShiftAccess = canView || canOpen || canClose || canMoveCash;

  const current = useCurrentShift(branchId, {
    enabled: Boolean(branchId && hasShiftAccess),
  });

  const [openModal, setOpenModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  if (!branchId || !hasShiftAccess || current.isPending) return null;

  const shift = current.data;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={shift ? 'success' : 'warning'}>
          {shift ? shift.shiftNo : t('shifts.active.noneTitle')}
        </Badge>
        <span className="text-muted-foreground">
          {shift
            ? t('shifts.bar.expected', {
                amount: fmt.money(shift.summary?.expectedCash ?? shift.expectedCash),
              })
            : t('shifts.active.noneDescription')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!shift && canOpen && (
          <Button type="button" size="sm" onClick={() => setOpenModal(true)}>
            {t('shifts.actions.openShift')}
          </Button>
        )}
        {shift && canMoveCash && (
          <Button type="button" variant="outline" size="sm" onClick={() => setMovementModal(true)}>
            {t('shifts.actions.cashMovement')}
          </Button>
        )}
        {shift && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReportTarget({ id: shift.id, kind: 'x' })}
          >
            {t('shifts.actions.xReport')}
          </Button>
        )}
        {shift && canClose && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCloseModal(true)}>
            {t('shifts.actions.closeShift')}
          </Button>
        )}
      </div>

      <OpenShiftDialog open={openModal} onOpenChange={setOpenModal} branchId={branchId} />
      <CashMovementDialog open={movementModal} onOpenChange={setMovementModal} shift={shift} />
      <CloseShiftDialog
        open={closeModal}
        onOpenChange={setCloseModal}
        shift={shift}
        onClosed={(res) => {
          if (res?.shift?.id) setReportTarget({ id: res.shift.id, kind: 'z' });
        }}
      />
      <ShiftReportDialog
        open={Boolean(reportTarget)}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
        shiftId={reportTarget?.id}
        kind={reportTarget?.kind ?? 'x'}
      />
    </div>
  );
}
