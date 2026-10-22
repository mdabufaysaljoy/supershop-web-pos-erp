import { PERMISSIONS as P } from '@supershop/shared';
import { Plus, ShieldCheck } from 'lucide-react';
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
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { RoleForm } from '../components/RoleForm';
import { roles, usePermissionRegistry } from '../resource';

/**
 * Roles (P0.5): what a staff account is allowed to see and do. The shop starts with ready-made
 * roles — cashier, store manager, accountant and so on — which it may tune, and can add its own.
 * A role is given to a staff member on the Staff screen.
 */
export function RolesPage() {
  const { t } = useTranslation();
  const canManage = useCan()(P.ROLE_MANAGE);
  const list = roles.useList({});
  const registry = usePermissionRegistry();
  const [editing, setEditing] = useState(null); // null | 'new' | role
  const items = list.data?.data ?? [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('roles.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('roles.description')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('roles.add')}
          </Button>
        )}
      </header>

      {list.isError && <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>}
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('roles.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('roles.form.name')}</TableHead>
              <TableHead>{t('roles.form.description')}</TableHead>
              <TableHead>{t('roles.scope')}</TableHead>
              <TableHead>{t('roles.permissionCount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {canManage ? (
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => setEditing(role)}
                      >
                        {role.name}
                      </button>
                    ) : (
                      <span className="font-medium">{role.name}</span>
                    )}
                    {role.isSystem && (
                      <Badge tone="info">
                        <ShieldCheck className="me-1 inline size-3" aria-hidden />
                        {t('roles.ready')}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-md text-sm text-muted-foreground">
                  {role.description || '—'}
                </TableCell>
                <TableCell>
                  <Badge tone={role.allBranches ? 'info' : 'muted'}>
                    {t(role.allBranches ? 'roles.allBranches' : 'roles.ownBranches')}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{role.permissions?.length ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-3xl" closeLabel={t('common.close')}>
            <DialogTitle>{t(editing === 'new' ? 'roles.add' : 'roles.edit')}</DialogTitle>
            <div className="max-h-[70vh] overflow-y-auto pe-1">
              <RoleForm
                role={editing === 'new' ? null : editing}
                groups={registry.data?.groups}
                onDone={() => setEditing(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
