import { PERMISSIONS as P } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OpenShiftDialog } from '@/features/shifts/components/ShiftDialogs';
import { useCurrentShift } from '@/features/shifts/resource';
import { useCan } from '@/lib/permissions';

/**
 * Shift alert strip on the till (P6.5): displays only when a shift is not currently open,
 * providing the cashier with an immediate button to open a shift.
 * When a shift is open, it returns null to keep the POS workspace uncluttered.
 */
export function ShiftBar({ branchId }) {
  const { t } = useTranslation();
  const can = useCan();
  const canOpen = can(P.SHIFT_OPEN);
  const current = useCurrentShift(branchId, {
    enabled: Boolean(branchId),
  });

  const [openModal, setOpenModal] = useState(false);

  if (!branchId || current.isPending) return null;

  const shift = current.data;

  // When shift is already open, do not clutter the POS page (managed via /shifts).
  // When shift is not open, show a clean banner with an option to open it.
  if (shift) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-2xs">
      <div className="flex items-center gap-2.5">
        <Badge tone="warning">{t('shifts.active.noneTitle')}</Badge>
        <span className="text-xs font-medium text-amber-900">
          {t('shifts.active.noneDescription')}
        </span>
      </div>
      {canOpen && (
        <Button
          type="button"
          size="sm"
          className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs"
          onClick={() => setOpenModal(true)}
        >
          {t('shifts.actions.openShift')}
        </Button>
      )}

      <OpenShiftDialog open={openModal} onOpenChange={setOpenModal} branchId={branchId} />
    </div>
  );
}
