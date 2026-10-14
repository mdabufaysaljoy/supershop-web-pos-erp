import { MENU } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useCreateMenu, useDeleteMenu } from '../resource';

/** The shop's menus: what there is, and a way to start another one (P5.4). */
export function MenusCard({ menus, disabled }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateMenu();
  const remove = useDeleteMenu();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({ title: '', location: 'header' });

  const add = async () => {
    const menu = await create.mutateAsync(draft).catch((err) => {
      run(Promise.reject(err));
      return null;
    });
    if (menu) {
      setDraft({ title: '', location: 'header' });
      navigate(`/appearance/${menu.id}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.menus.title')}</CardTitle>
        <CardDescription>{t('appearance.menus.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {menus.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('appearance.menus.empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {menus.map((menu) => (
              <li
                key={menu.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
              >
                <Link to={`/appearance/${menu.id}`} className="font-medium hover:underline">
                  {menu.title}
                </Link>
                <Badge tone="muted">{t(`appearance.locations.${menu.location}`)}</Badge>
                <span className="text-sm text-muted-foreground">
                  {t('appearance.menus.itemCount', { count: menu.items.length })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  disabled={disabled || remove.isPending}
                  onClick={() => remove.mutate(menu.id)}
                >
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <FormField label={t('appearance.menus.newTitle')} error={fieldMessage(t, errors.title)}>
            <PlainTextInput
              value={draft.title}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </FormField>
          <FormField label={t('appearance.menus.location')}>
            <Select
              value={draft.location}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
            >
              {MENU.LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {t(`appearance.locations.${location}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <Button
            type="button"
            disabled={disabled || !draft.title || create.isPending}
            onClick={add}
          >
            {t('appearance.menus.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
