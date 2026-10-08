import { PERMISSIONS as P } from '@supershop/shared';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useAuthStore } from '@/features/auth/store';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { BranchForm } from '../components/BranchForm';
import { BranchStaff } from '../components/BranchStaff';
import { branches } from '../resource';

const cityOf = (b) => [b.address?.district, b.address?.city].filter(Boolean).join(', ') || '—';

/**
 * Branches (stores and warehouses) in the user's scope + create/edit dialog + staff dialog.
 * Creating/deleting branches is for staff whose role covers all branches.
 */
export function BranchesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const isHq = useAuthStore((s) => Boolean(s.access?.allBranches));
  const canManage = can(P.BRANCH_MANAGE);
  const canSeeStaff = can(P.STAFF_VIEW);
  const { data, isPending, isError, error } = branches.useList({});
  const [editing, setEditing] = useState(null); // null | 'new' | branch
  const [staffOf, setStaffOf] = useState(null);
  const items = data?.data ?? [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('branches.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('branches.description')}</p>
        </div>
        {canManage && isHq && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('branches.add')}
          </Button>
        )}
      </header>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('branches.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('branches.form.code')}</TableHead>
              <TableHead>{t('branches.form.name')}</TableHead>
              <TableHead>{t('branches.form.type')}</TableHead>
              <TableHead>{t('branches.location')}</TableHead>
              <TableHead>{t('branches.staffCol')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.id}>
                <TableCell dir="ltr" className="text-start font-mono text-xs">
                  {b.code}
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => setEditing(b)}
                    >
                      {b.name.en}
                    </button>
                  ) : (
                    <span className="font-medium">{b.name.en}</span>
                  )}
                </TableCell>
                <TableCell>{t(`branches.types.${b.type}`)}</TableCell>
                <TableCell>{cityOf(b)}</TableCell>
                <TableCell>
                  {canSeeStaff ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStaffOf(b)}
                      aria-label={t('branches.staff.open', { name: b.name.en })}
                    >
                      <Users className="size-4" aria-hidden />
                      {b.staffCount}
                    </Button>
                  ) : (
                    b.staffCount
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={b.isActive ? 'ok' : 'muted'}>
                      {t(b.isActive ? 'common.active' : 'common.inactive')}
                    </Badge>
                    {b.fulfillsOnlineOrders && <Badge>{t('branches.online')}</Badge>}
                    {b.pickupEnabled && <Badge>{t('branches.pickup')}</Badge>}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
          <DialogTitle className="pe-8">
            {editing === 'new' ? t('branches.newTitle') : editing?.name?.en}
          </DialogTitle>
          {editing && (
            <BranchForm
              key={editing === 'new' ? 'new' : editing.id}
              branch={editing === 'new' ? null : editing}
              canDelete={isHq}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(staffOf)} onOpenChange={(open) => !open && setStaffOf(null)}>
        <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
          <DialogTitle className="pe-8">
            {t('branches.staff.title', { name: staffOf?.name?.en ?? '' })}
          </DialogTitle>
          {staffOf && <BranchStaff branch={staffOf} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
