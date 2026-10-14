import { SITE } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useUpdateLayout } from '../resource';

/**
 * Where the shop's menus go (P5.4): one in the header (or its categories instead), up to four in
 * the footer, plus the footer's own note — translated like any other content.
 */
const MAX_FOOTER_MENUS = 4;

export function ChromeCard({ layout, menus, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({
    headerMenuId: layout.headerMenuId ?? '',
    showCategoryRow: layout.showCategoryRow,
    note: layout.footer.note?.en ?? '',
    menuIds: layout.footer.menuIds ?? [],
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const toggleFooter = (id) =>
    set({
      menuIds: draft.menuIds.includes(id)
        ? draft.menuIds.filter((x) => x !== id)
        : draft.menuIds.length < MAX_FOOTER_MENUS
          ? [...draft.menuIds, id]
          : draft.menuIds,
    });
  const move = (index, to) => {
    if (to < 0 || to >= draft.menuIds.length) return;
    const next = [...draft.menuIds];
    [next[index], next[to]] = [next[to], next[index]];
    set({ menuIds: next });
  };
  const titleOf = (id) => menus.find((m) => m.id === id)?.title ?? id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.chrome.title')}</CardTitle>
        <CardDescription>{t('appearance.chrome.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField
          label={t('appearance.chrome.headerMenu')}
          description={t('appearance.chrome.headerMenuHelp')}
        >
          <Select
            value={draft.headerMenuId}
            disabled={disabled}
            onChange={(e) => set({ headerMenuId: e.target.value })}
          >
            <option value="">{t('appearance.chrome.noHeaderMenu')}</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.title}
              </option>
            ))}
          </Select>
        </FormField>

        <Checkbox
          id="show-category-row"
          label={t('appearance.chrome.showCategoryRow')}
          description={t('appearance.chrome.showCategoryRowHelp')}
          checked={draft.showCategoryRow}
          disabled={disabled}
          onChange={(e) => set({ showCategoryRow: e.target.checked })}
        />

        <fieldset className="grid gap-2">
          <legend className="text-sm leading-none font-medium">
            {t('appearance.chrome.footerMenus')}
          </legend>
          {menus.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('appearance.menus.empty')}</p>
          ) : (
            menus.map((menu) => (
              <Checkbox
                key={menu.id}
                id={`footer-${menu.id}`}
                label={menu.title}
                checked={draft.menuIds.includes(menu.id)}
                disabled={disabled}
                onChange={() => toggleFooter(menu.id)}
              />
            ))
          )}
        </fieldset>

        {draft.menuIds.length > 1 && (
          <ol className="grid gap-1">
            {draft.menuIds.map((id, index) => (
              <li key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                <span className="flex-1 truncate">{titleOf(id)}</span>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  {t('common.moveUp')}
                </button>
              </li>
            ))}
          </ol>
        )}

        <FormField
          label={t('appearance.chrome.footerNote')}
          error={fieldMessage(t, errors['footer.note'])}
        >
          <PlainTextInput
            value={draft.note}
            maxLength={SITE.FOOTER_NOTE_MAX}
            disabled={disabled}
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
        <ArabicPreview label={t('cms.builder.arabic')} value={layout.footer.note} />

        <Button
          type="button"
          className="justify-self-start"
          disabled={disabled || save.isPending}
          onClick={() =>
            run(
              save.mutateAsync({
                headerMenuId: draft.headerMenuId || null,
                showCategoryRow: draft.showCategoryRow,
                footer: { note: draft.note, menuIds: draft.menuIds },
              }),
            )
          }
        >
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
