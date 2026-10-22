import { PERMISSIONS as P } from '@supershop/shared';
import { Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
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
import { useInventoryBranches } from '@/features/inventory/resource';
import { roles as rolesResource } from '@/features/roles/resource';
import { Select } from '@/features/settings/components/controls';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { StaffForm } from '../components/StaffForm';
import { staff } from '../resource';

const PAGE_SIZE = 20;

/**
 * Staff (P0.5): who may sign in, and what they may do once they are in. Access is not picked
 * person by person — it is the ROLE they are given, plus the branches they work in.
 */
export function StaffPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canManage = can(P.STAFF_MANAGE);
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const status = searchParams[0].get('status') ?? '';
  const roleId = searchParams[0].get('roleId') ?? '';

  const list = staff.useList({
    page,
    limit: PAGE_SIZE,
    ...(q && { q }),
    ...(status && { status }),
    ...(roleId && { roleId }),
  });
  // The editor needs both to show a role name and a branch name; a staff manager may read roles.
  const roles = rolesResource.useList({}, { enabled: canManage });
  const branches = useInventoryBranches();

  const [editing, setEditing] = useState(null); // null | 'new' | member
  const items = list.data?.data ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.meta?.total ?? 0) / PAGE_SIZE));
  /** The row carries the role's name; the roles list is only needed for the editor and filter. */
  const roleName = (member) =>
    member.roleName ?? roles.data?.data?.find((r) => r.id === member.roleId)?.name;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('staff.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('staff.description')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('staff.add')}
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchForm initial={q} label={t('staff.search')} onSearch={(value) => go({ q: value })} />
        <Select
          aria-label={t('common.status')}
          value={status}
          className="w-44"
          onChange={(e) => go({ status: e.target.value })}
        >
          <option value="">{t('staff.filters.allStatuses')}</option>
          <option value="active">{t('staff.status.active')}</option>
          <option value="disabled">{t('staff.status.disabled')}</option>
        </Select>
        {canManage && (
          <Select
            aria-label={t('staff.form.role')}
            value={roleId}
            className="w-52"
            onChange={(e) => go({ roleId: e.target.value })}
          >
            <option value="">{t('staff.filters.allRoles')}</option>
            {(roles.data?.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {list.isError && <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>}
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('staff.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('staff.form.name')}</TableHead>
              <TableHead>{t('staff.form.email')}</TableHead>
              <TableHead>{t('staff.form.role')}</TableHead>
              <TableHead>{t('staff.form.branches')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {canManage ? (
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => setEditing(member)}
                      >
                        {member.name}
                      </button>
                    ) : (
                      <span className="font-medium">{member.name}</span>
                    )}
                    {member.isSuperAdmin && (
                      <Badge tone="info">
                        <ShieldCheck className="me-1 inline size-3" aria-hidden />
                        {t('staff.superAdmin')}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell dir="ltr" className="text-start text-sm">
                  {member.email}
                </TableCell>
                <TableCell className="text-sm">
                  {member.isSuperAdmin
                    ? t('staff.allAccess')
                    : (roleName(member) ?? t('staff.form.noRole'))}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {member.branchIds?.length
                    ? t('staff.branchCount', { count: member.branchIds.length })
                    : '—'}
                </TableCell>
                <TableCell>
                  <Badge tone={member.status === 'active' ? 'ok' : 'muted'}>
                    {t(`staff.status.${member.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
            <DialogTitle>{t(editing === 'new' ? 'staff.add' : 'staff.edit')}</DialogTitle>
            <div className="max-h-[70vh] overflow-y-auto pe-1">
              <StaffForm
                member={editing === 'new' ? null : editing}
                roles={roles.data?.data ?? []}
                branches={branches.data ?? []}
                onDone={() => setEditing(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
