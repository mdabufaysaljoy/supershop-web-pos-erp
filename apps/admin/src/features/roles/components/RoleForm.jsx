import { createRbacSchemas } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormActions } from '@/components/FormActions';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/features/settings/components/controls';
import { useAuthStore } from '@/features/auth/store';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { roles } from '../resource';
import { PermissionMatrix } from './PermissionMatrix';

const schemas = createRbacSchemas();

const initialForm = (role) => ({
  name: role?.name ?? '',
  description: role?.description ?? '',
  allBranches: role?.allBranches ?? false,
  permissions: role?.permissions ?? [],
});

/**
 * Create or edit a role. A ready-made role can be tuned but never deleted (the API protects it),
 * and a role still assigned to someone cannot be deleted either — reassign that staff first.
 */
export function RoleForm({ role, groups, onDone }) {
  const { t } = useTranslation();
  const create = roles.useCreate();
  const update = roles.useUpdate();
  const remove = roles.useRemove();
  const access = useAuthStore((s) => s.access);
  /** A super-admin holds everything; anyone else may only pass on what they hold. */
  const grantable = access?.isSuperAdmin ? null : (access?.permissions ?? []);

  const [form, setForm] = useState(() => initialForm(role));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !role;
  const err = (key) => fieldMessage(t, errors[key]);
  const busy = create.isPending || update.isPending;

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description,
      allBranches: form.allBranches,
      permissions: form.permissions,
    };
    const parsed = (isNew ? schemas.roleCreate : schemas.roleUpdate).safeParse(body);
    if (!parsed.success) return setErrors(detailsToErrors(issuesToDetails(parsed.error.issues)));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: role.id, body: parsed.data });
      onDone();
    } catch (error) {
      setErrors(detailsToErrors(error?.details));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {role?.isSystem && <Alert>{t('roles.form.systemNote')}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
        <FormField label={t('roles.form.name')} error={err('name')} required>
          <PlainTextInput
            maxLength={50}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('roles.form.description')}
          description={t('roles.form.descriptionHint')}
          error={err('description')}
        >
          <PlainTextInput
            maxLength={200}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </FormField>
      </div>

      <Checkbox
        id="role-all-branches"
        label={t('roles.form.allBranches')}
        description={t('roles.form.allBranchesHint')}
        checked={form.allBranches}
        disabled={!access?.isSuperAdmin && !access?.allBranches}
        onChange={(e) => setForm({ ...form, allBranches: e.target.checked })}
      />

      <FormField
        label={t('roles.form.permissions', { count: form.permissions.length })}
        error={err('permissions')}
      >
        <PermissionMatrix
          groups={groups ?? {}}
          selected={form.permissions}
          grantable={grantable}
          onChange={(permissions) => setForm({ ...form, permissions })}
        />
      </FormField>

      <FormActions
        isNew={isNew}
        busy={busy}
        canDelete={!role?.isSystem}
        confirmDelete={confirmDelete}
        deleting={remove.isPending}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={async () => {
          await remove.mutateAsync(role.id).catch(() => null);
          if (!remove.isError) onDone();
        }}
        onCancel={onDone}
      />
    </form>
  );
}
