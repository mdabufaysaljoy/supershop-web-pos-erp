import { PERMISSIONS as P, SHIFT } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventoryBranches } from '@/features/inventory/resource';
import { usePrintingStatus } from '@/features/printing/resource';
import { Select } from '@/features/settings/components/controls';
import { useActiveBranchStore } from '@/features/branches/activeBranch';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import {
  CashMovementDialog,
  CloseShiftDialog,
  OpenShiftDialog,
  ShiftReportDialog,
} from '../components/ShiftDialogs';
import { useCurrentShift, useOpenCashDrawer, useShifts } from '../resource';

const PAGE_SIZE = 20;
export function ShiftsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const branches = useInventoryBranches();
  const printing = usePrintingStatus();
  const openDrawer = useOpenCashDrawer();
  const searchParams = useSearchParams();
  const { page, go } = useListParams(searchParams);
  const status = searchParams[0].get('status') ?? '';

  const chosenBranch = useActiveBranchStore((s) => s.branchId);
  const chooseBranch = useActiveBranchStore((s) => s.setBranchId);
  const options = branches.data ?? [];
  const branchId = chosenBranch || (options.length === 1 ? options[0].id : '');

  const canView = can(P.SHIFT_VIEW);
  const canOpen = can(P.SHIFT_OPEN);
  const canClose = can(P.SHIFT_CLOSE);
  const canMoveCash = can(P.SHIFT_CASH_MOVEMENT);
  const canKickDrawer = canMoveCash || canOpen || canClose;

  const current = useCurrentShift(branchId, {
    enabled: Boolean(canView || canOpen || canClose || canMoveCash),
  });
  const list = useShifts(
    {
      page,
      limit: PAGE_SIZE,
      ...(branchId && { branchId }),
      ...(status && { status }),
    },
    { enabled: canView },
  );

  const [openModal, setOpenModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { id, kind: 'x' | 'z' }

  const activeShift = current.data;
  const items = list.data?.data ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.meta?.total ?? 0) / PAGE_SIZE));

  const branchName = (id) => {
    const found = options.find((b) => b.id === id);
    return found ? (found.name?.en ?? found.code) : id;
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('shifts.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('shifts.description')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            {t('shifts.branch')}
            <Select
              className="w-56"
              value={branchId}
              onChange={(e) => {
                chooseBranch(e.target.value);
                go({ page: 1 });
              }}
            >
              <option value="">{t('shifts.allBranches')}</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </Select>
          </label>
          {canView && (
            <label className="grid gap-1 text-sm">
              {t('shifts.statusFilter')}
              <Select
                className="w-40"
                value={status}
                onChange={(e) => go({ status: e.target.value, page: 1 })}
              >
                <option value="">{t('shifts.allStatuses')}</option>
                {SHIFT.STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`shifts.status.${s}`)}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {activeShift
                  ? t('shifts.active.heading', { number: activeShift.shiftNo })
                  : t('shifts.active.noneTitle')}
                {activeShift && <Badge tone="success">{t('shifts.status.open')}</Badge>}
              </h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {activeShift
                ? t('shifts.active.openedSince', {
                    branch: branchName(activeShift.branchId),
                    time: fmt.dateTime(activeShift.openedAt),
                  })
                : branchId
                  ? t('shifts.active.noneDescription')
                  : t('shifts.active.chooseBranchPrompt')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!activeShift && canOpen && (
              <Button type="button" disabled={!branchId} onClick={() => setOpenModal(true)}>
                {t('shifts.actions.openShift')}
              </Button>
            )}
            {activeShift && canMoveCash && (
              <Button type="button" variant="outline" onClick={() => setMovementModal(true)}>
                {t('shifts.actions.cashMovement')}
              </Button>
            )}
            {activeShift && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setReportTarget({ id: activeShift.id, kind: 'x' })}
              >
                {t('shifts.actions.xReport')}
              </Button>
            )}
            {activeShift && canKickDrawer && printing.data?.enabled && (
              <Button
                type="button"
                variant="outline"
                disabled={openDrawer.isPending}
                onClick={() => openDrawer.mutate({})}
              >
                {t('shifts.actions.openDrawer')}
              </Button>
            )}
            {activeShift && canClose && (
              <Button type="button" onClick={() => setCloseModal(true)}>
                {t('shifts.actions.closeShift')}
              </Button>
            )}
          </div>
        </CardHeader>

        {activeShift && (
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Metric
                label={t('shifts.fields.openingCash')}
                value={fmt.money(activeShift.openingCash)}
              />
              <Metric
                label={t('shifts.fields.cashSales')}
                value={fmt.money(activeShift.summary?.cashSales ?? 0)}
              />
              <Metric
                label={t('shifts.fields.cashIn')}
                value={fmt.money(activeShift.summary?.cashIn ?? 0)}
              />
              <Metric
                label={t('shifts.fields.cashOut')}
                value={fmt.money(activeShift.summary?.cashOut ?? 0)}
              />
              <Metric
                label={t('shifts.fields.expectedCash')}
                value={fmt.money(activeShift.summary?.expectedCash ?? activeShift.expectedCash)}
                strong
              />
              <Metric
                label={t('shifts.fields.totalSales')}
                value={fmt.money(activeShift.summary?.sales?.total ?? 0)}
                sub={t('shifts.active.ordersCount', {
                  count: activeShift.summary?.sales?.count ?? 0,
                })}
              />
            </dl>

            {activeShift.movements?.length > 0 && (
              <div className="grid gap-2 border-t pt-3">
                <h3 className="text-sm font-medium">{t('shifts.movement.recentTitle')}</h3>
                <ul className="grid gap-1 text-sm">
                  {activeShift.movements.map((m, i) => (
                    <li
                      key={`${m.createdAt}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone={m.type === 'in' ? 'success' : 'warning'}>
                          {t(`shifts.movement.types.${m.type}`)}
                        </Badge>
                        <span>{m.reason}</span>
                      </span>
                      <span className="tabular-nums font-medium">
                        {m.type === 'in' ? '+' : '-'}
                        {fmt.money(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {canView && (
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">{t('shifts.historyTitle')}</h2>
          {list.isError && <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>}
          {list.isPending ? (
            <Skeleton className="h-64" />
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t('shifts.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('shifts.columns.shift')}</TableHead>
                  <TableHead>{t('shifts.columns.branch')}</TableHead>
                  <TableHead>{t('shifts.columns.openedAt')}</TableHead>
                  <TableHead>{t('shifts.columns.closedAt')}</TableHead>
                  <TableHead className="text-end">{t('shifts.fields.expectedCash')}</TableHead>
                  <TableHead className="text-end">{t('shifts.fields.closingCash')}</TableHead>
                  <TableHead className="text-end">{t('shifts.fields.discrepancy')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-end">{t('shifts.columns.reports')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-medium">
                      {shift.shiftNo}
                      {shift.zReportNo && (
                        <span className="block text-xs text-muted-foreground">
                          {shift.zReportNo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{branchName(shift.branchId)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt.dateTime(shift.openedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {shift.closedAt ? fmt.dateTime(shift.closedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {fmt.money(shift.expectedCash)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {shift.closingCash != null ? fmt.money(shift.closingCash) : '—'}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {shift.discrepancy != null ? (
                        <Badge
                          tone={
                            shift.discrepancy === 0
                              ? 'success'
                              : shift.discrepancy > 0
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {shift.discrepancy > 0
                            ? `+${fmt.money(shift.discrepancy)}`
                            : fmt.money(shift.discrepancy)}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={shift.status === 'open' ? 'success' : 'neutral'}>
                        {t(`shifts.status.${shift.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReportTarget({ id: shift.id, kind: 'x' })}
                        >
                          {t('shifts.actions.xReport')}
                        </Button>
                        {shift.status === 'closed' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReportTarget({ id: shift.id, kind: 'z' })}
                          >
                            {t('shifts.actions.zReport')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
        </section>
      )}

      <OpenShiftDialog open={openModal} onOpenChange={setOpenModal} branchId={branchId} />
      <CashMovementDialog
        open={movementModal}
        onOpenChange={setMovementModal}
        shift={activeShift}
      />
      <CloseShiftDialog
        open={closeModal}
        onOpenChange={setCloseModal}
        shift={activeShift}
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

function Metric({ label, value, sub, strong = false }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-base tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>
        {value}
      </dd>
      {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}
