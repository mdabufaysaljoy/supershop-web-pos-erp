import { MENU, PERMISSIONS as P } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/features/settings/components/controls';
import { errorMessage, fieldMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { MenuItemRow } from '../components/MenuItemRow';
import { newItem } from '../newItem';
import { useFieldErrors } from '../errors';
import { useMenu, useUpdateMenu } from '../resource';

/**
 * The menu editor (P5.4): a list of items, each pointing at something, with one level of children
 * for a mega-menu column. Saved in one go — a menu is small, and a half-saved navigation is worse
 * than an unsaved one.
 */
export function MenuEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data: menu, isPending, isError, error } = useMenu(id);
  if (isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  if (isPending) return <Skeleton className="h-96" />;
  return <Editor key={menu.id} menu={menu} />;
}

function Editor({ menu }) {
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can(P.MENU_MANAGE);
  const save = useUpdateMenu(menu.id);
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({
    title: menu.title,
    location: menu.location,
    items: menu.items,
  });

  const arabicOf = (itemId) => menu.texts.find((text) => text.key === itemId)?.value;
  const setItems = (items) => setDraft((d) => ({ ...d, items }));
  const replaceAt = (index, item) =>
    setItems(draft.items.map((current, i) => (i === index ? item : current)));
  const move = (index, to) => {
    if (to < 0 || to >= draft.items.length) return;
    const next = [...draft.items];
    [next[index], next[to]] = [next[to], next[index]];
    setItems(next);
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-0.5">
        <Link to="/appearance" className="text-sm text-muted-foreground hover:underline">
          ← {t('appearance.title')}
        </Link>
        <h1 className="text-xl font-semibold">{menu.title}</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('appearance.menus.newTitle')} error={fieldMessage(t, errors.title)}>
          <PlainTextInput
            value={draft.title}
            disabled={!canEdit}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </FormField>
        <FormField label={t('appearance.menus.location')}>
          <Select
            value={draft.location}
            disabled={!canEdit}
            onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
          >
            {MENU.LOCATIONS.map((location) => (
              <option key={location} value={location}>
                {t(`appearance.locations.${location}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {draft.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('appearance.item.empty')}
        </p>
      ) : (
        <ul className="grid gap-3">
          {draft.items.map((item, index) => (
            <MenuItemRow
              key={item.id}
              item={item}
              path={`items.${index}`}
              arabic={arabicOf(item.id)}
              errors={errors}
              disabled={!canEdit}
              onChange={(next) => replaceAt(index, next)}
              onRemove={() => setItems(draft.items.filter((_, i) => i !== index))}
              onMoveUp={index > 0 ? () => move(index, index - 1) : undefined}
              onAddChild={
                (item.children?.length ?? 0) < MENU.MAX_CHILDREN
                  ? () =>
                      replaceAt(index, { ...item, children: [...(item.children ?? []), newItem()] })
                  : undefined
              }
            >
              {item.children?.length > 0 && (
                <ul className="grid gap-3 ps-6">
                  {item.children.map((child, childIndex) => (
                    <MenuItemRow
                      key={child.id}
                      item={child}
                      path={`items.${index}.children.${childIndex}`}
                      arabic={arabicOf(child.id)}
                      errors={errors}
                      disabled={!canEdit}
                      onChange={(next) =>
                        replaceAt(index, {
                          ...item,
                          children: item.children.map((c, i) => (i === childIndex ? next : c)),
                        })
                      }
                      onRemove={() =>
                        replaceAt(index, {
                          ...item,
                          children: item.children.filter((_, i) => i !== childIndex),
                        })
                      }
                      onMoveUp={
                        childIndex > 0
                          ? () => {
                              const next = [...item.children];
                              [next[childIndex - 1], next[childIndex]] = [
                                next[childIndex],
                                next[childIndex - 1],
                              ];
                              replaceAt(index, { ...item, children: next });
                            }
                          : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </MenuItemRow>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={draft.items.length >= MENU.MAX_ITEMS}
            onClick={() => setItems([...draft.items, newItem()])}
          >
            {t('appearance.item.add')}
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => run(save.mutateAsync(draft))}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
