import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/features/settings/components/controls';

/**
 * The permission picker: one block per area, a checkbox per permission, and a tick-all for the
 * area. Labels come from `permissions.*` keys and fall back to the key itself, so a permission
 * added to the registry is usable here before anyone writes a word about it.
 *
 * `grantable` is what the editor themselves holds: nobody may give away access they do not have
 * (the API refuses it as PERMISSION_ESCALATION), so those boxes are disabled and marked.
 */
export function PermissionMatrix({ groups, selected, grantable, disabled, onChange }) {
  const { t } = useTranslation();
  const has = (key) => selected.includes(key);
  const mayGrant = (key) => !grantable || grantable.includes(key);

  const toggle = (key, on) =>
    onChange(on ? [...new Set([...selected, key])] : selected.filter((k) => k !== key));

  const setGroup = (keys, on) => {
    const allowed = keys.filter(mayGrant);
    onChange(
      on ? [...new Set([...selected, ...allowed])] : selected.filter((k) => !allowed.includes(k)),
    );
  };

  return (
    <div className="grid gap-3">
      {Object.entries(groups).map(([group, keys]) => {
        const chosen = keys.filter(has).length;
        const allOn = chosen === keys.length;
        return (
          <section key={group} className="rounded-lg border bg-muted/20 p-3">
            <header className="mb-2 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {t(`permissions.groups.${group}`, group)}
                {chosen > 0 && (
                  <Badge tone={allOn ? 'ok' : 'muted'}>
                    {chosen}/{keys.length}
                  </Badge>
                )}
              </h3>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setGroup(keys, !allOn)}
                >
                  {t(allOn ? 'roles.form.clearGroup' : 'roles.form.selectGroup')}
                </Button>
              )}
            </header>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {keys.map((key) => (
                <Checkbox
                  key={key}
                  id={`perm-${key}`}
                  label={t(`permissions.keys.${key}`, key)}
                  description={mayGrant(key) ? undefined : t('roles.form.notYours')}
                  checked={has(key)}
                  disabled={disabled || !mayGrant(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
