import { PERMISSIONS as P } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useAssignment, useBranchStaff, useStaffSearch } from '../resource';

/**
 * Staff working at a branch + assign/unassign. The server applies the staff rules (no editing
 * your own access, no staff outside your branches, no super-admins unless you are one).
 */
export function BranchStaff({ branch }) {
  const { t } = useTranslation();
  const can = useCan();
  const canAssign = can(P.BRANCH_MANAGE) && can(P.STAFF_MANAGE);
  const assigned = useBranchStaff(branch.id);
  const assignment = useAssignment(branch.id);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const candidates = useStaffSearch(q, { enabled: canAssign && searching });
  const assignedIds = new Set((assigned.data ?? []).map((s) => s.id));
  const busy = assignment.isPending;

  return (
    <div className="grid gap-4">
      <section className="grid gap-2" aria-label={t('branches.staff.assigned')}>
        <h3 className="text-sm font-medium">{t('branches.staff.assigned')}</h3>
        {assigned.isError && <Alert variant="destructive">{errorMessage(t, assigned.error)}</Alert>}
        {assigned.isPending ? (
          <Skeleton className="h-16" />
        ) : assigned.data?.length ? (
          <ul className="grid gap-2">
            {assigned.data.map((s) => (
              <StaffRow key={s.id} staff={s}>
                {canAssign && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => assignment.mutate({ staffId: s.id, assigned: false })}
                    aria-label={t('branches.staff.removeFrom', { name: s.name })}
                  >
                    {t('branches.staff.remove')}
                  </Button>
                )}
              </StaffRow>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('branches.staff.none')}</p>
        )}
      </section>

      {canAssign && (
        <section className="grid gap-2 border-t pt-4" aria-label={t('branches.staff.addTitle')}>
          <h3 className="text-sm font-medium">{t('branches.staff.addTitle')}</h3>
          <SearchForm
            initial={q}
            label={t('branches.staff.search')}
            onSearch={(v) => {
              setQ(v);
              setSearching(true);
            }}
          />
          {searching &&
            (candidates.isPending ? (
              <Skeleton className="h-16" />
            ) : (
              <CandidateList
                staff={(candidates.data ?? []).filter((s) => !assignedIds.has(s.id))}
                busy={busy}
                onAssign={(s) => assignment.mutate({ staffId: s.id, assigned: true })}
              />
            ))}
        </section>
      )}
    </div>
  );
}

function CandidateList({ staff, busy, onAssign }) {
  const { t } = useTranslation();
  if (!staff.length)
    return <p className="text-sm text-muted-foreground">{t('branches.staff.noMatches')}</p>;
  return (
    <ul className="grid gap-2">
      {staff.map((s) => (
        <StaffRow key={s.id} staff={s}>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onAssign(s)}
            aria-label={t('branches.staff.assignTo', { name: s.name })}
          >
            {t('branches.staff.assign')}
          </Button>
        </StaffRow>
      ))}
    </ul>
  );
}

function StaffRow({ staff, children }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{staff.name}</span>
        <span className="truncate text-xs text-muted-foreground" dir="ltr">
          {staff.email}
        </span>
      </span>
      {staff.status !== 'active' && <Badge tone="muted">{t('common.inactive')}</Badge>}
      {children}
    </li>
  );
}
