import { createRbacSchemas } from '@supershop/shared';
import { EmailInput, FormField, NameInput, PasswordInput, PhoneInput } from '@supershop/ui';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions } from '@/components/FormActions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { staff as staffResource, useRevokeSessions } from '../resource';

const schemas = createRbacSchemas();

const initialForm = (member) => ({
  name: member?.name ?? '',
  email: member?.email ?? '',
  phone: member?.phone ?? '',
  password: '',
  roleId: member?.roleId ?? '',
  branchIds: member?.branchIds ?? [],
  status: member?.status ?? 'active',
  isSuperAdmin: member?.isSuperAdmin ?? false,
});

/**
 * Create or edit a staff account. Access is given as a ROLE — the whole point of the roles screen
 * — plus the branches this person works in; a role marked "all branches" covers every branch and
 * the picker is then beside the point.
 *
 * The server has the last word on all of it: it refuses access the editor does not hold, refuses
 * anyone editing their own access, and refuses disabling the last super-admin.
 */
export function StaffForm({ member, roles = [], branches = [], onDone }) {
  const { t } = useTranslation();
  const create = staffResource.useCreate();
  const update = staffResource.useUpdate();
  const remove = staffResource.useRemove();
  const revoke = useRevokeSessions();
  const me = useAuthStore((s) => s.access);

  const [form, setForm] = useState(() => initialForm(member));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !member;
  const isSelf = !isNew && me?.staffId === member.id;
  const role = roles.find((r) => r.id === form.roleId);
  const coversAllBranches = Boolean(form.isSuperAdmin || role?.allBranches);
  const err = (key) => fieldMessage(t, errors[key]);
  const busy = create.isPending || update.isPending;

  const toggleBranch = (id, on) =>
    setForm({
      ...form,
      branchIds: on
        ? [...new Set([...form.branchIds, id])]
        : form.branchIds.filter((b) => b !== id),
    });

  const submit = async (e) => {
    e.preventDefault();
    const base = {
      name: form.name,
      email: form.email,
      phone: form.phone.trim() === '' ? null : form.phone,
      roleId: form.roleId || null,
      branchIds: form.branchIds,
      isSuperAdmin: form.isSuperAdmin,
    };
    // A password is set once, on creation; afterwards it is the staff member's own to change.
    const body = isNew ? { ...base, password: form.password } : { ...base, status: form.status };
    const parsed = (isNew ? schemas.staffCreate : schemas.staffUpdate).safeParse(body);
    if (!parsed.success) return setErrors(detailsToErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: member.id, body: parsed.data });
      onDone();
    } catch (error) {
      setErrors(detailsToErrors(error?.details));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {isSelf && <Alert>{t('staff.form.selfNote')}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('staff.form.name')} error={err('name')} required>
          <NameInput
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField label={t('staff.form.email')} error={err('email')} required>
          <EmailInput
            value={form.email}
            autoComplete="off"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('staff.form.phone')} error={err('phone')}>
          <PhoneInput
            value={form.phone ?? ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </FormField>
        {isNew ? (
          <FormField
            label={t('staff.form.password')}
            description={t('staff.form.passwordHint')}
            error={err('password')}
            required
          >
            <PasswordInput
              value={form.password}
              autoComplete="new-password"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </FormField>
        ) : (
          <FormField label={t('common.status')} error={err('status')}>
            <Select
              value={form.status}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">{t('staff.status.active')}</option>
              <option value="disabled">{t('staff.status.disabled')}</option>
            </Select>
          </FormField>
        )}
      </div>

      <FormField
        label={t('staff.form.role')}
        description={role?.description || t('staff.form.roleHint')}
        error={err('roleId')}
      >
        <Select
          value={form.roleId ?? ''}
          disabled={isSelf || form.isSuperAdmin}
          onChange={(e) => setForm({ ...form, roleId: e.target.value })}
        >
          <option value="">{t('staff.form.noRole')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </FormField>

      {me?.isSuperAdmin && (
        <Checkbox
          id="staff-super-admin"
          label={t('staff.form.superAdmin')}
          description={t('staff.form.superAdminHint')}
          checked={form.isSuperAdmin}
          disabled={isSelf}
          onChange={(e) => setForm({ ...form, isSuperAdmin: e.target.checked })}
        />
      )}

      <FormField
        label={t('staff.form.branches')}
        description={coversAllBranches ? t('staff.form.branchesAll') : t('staff.form.branchesHint')}
        error={err('branchIds')}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {branches.map((b) => (
            <Checkbox
              key={b.id}
              id={`staff-branch-${b.id}`}
              label={b.name?.en ?? b.name ?? b.code}
              checked={form.branchIds.includes(b.id)}
              disabled={isSelf || coversAllBranches}
              onChange={(e) => toggleBranch(b.id, e.target.checked)}
            />
          ))}
        </div>
      </FormField>

      {!isNew && !isSelf && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(member.id)}
          >
            <LogOut className="size-4" aria-hidden />
            {t('staff.revokeSessions')}
          </Button>
        </div>
      )}

      <FormActions
        isNew={isNew}
        busy={busy}
        canDelete={!isSelf}
        confirmDelete={confirmDelete}
        deleting={remove.isPending}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={async () => {
          await remove.mutateAsync(member.id).catch(() => null);
          if (!remove.isError) onDone();
        }}
        onCancel={onDone}
      />
    </form>
  );
}
