import { MENU, SITE } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Select } from '@/features/settings/components/controls';
import { brands } from '@/features/brands/resource';
import { useCategories } from '@/features/categories/hooks';
import { parentOptions } from '@/features/categories/tree';
import { pages } from '@/features/pages/resource';
import { fieldMessage } from '@/lib/i18n';

/**
 * One menu item (P5.4): its label, what it points at, and — for a page, category or brand —
 * which one. Children use this same row, so a mega-menu column is edited like anything else.
 *
 * An item points at a THING, not a copied URL: the storefront resolves the address when it
 * renders, so renaming a category can never leave a dead link behind.
 */
export function MenuItemRow({
  item,
  path,
  arabic,
  errors,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onAddChild,
  children,
}) {
  const { t } = useTranslation();
  const { data: categoryList = [] } = useCategories();
  const pageList = pages.useList({ page: 1, limit: 100, status: 'published' });
  const brandList = brands.useList({ page: 1, limit: 100 });
  const err = (field) => fieldMessage(t, errors?.[`${path}.${field}`]);

  const refOptions =
    item.target === 'page'
      ? (pageList.data?.data ?? []).map((p) => ({ id: p.id, label: p.title?.en ?? p.slug }))
      : item.target === 'category'
        ? parentOptions(categoryList).map((c) => ({ id: c.id, label: c.label }))
        : item.target === 'brand'
          ? (brandList.data?.data ?? []).map((b) => ({ id: b.id, label: b.name }))
          : null;

  return (
    <li className="grid gap-3 rounded-xl border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('appearance.item.label')} error={err('label')}>
          <PlainTextInput
            value={item.label}
            maxLength={SITE.LABEL_MAX}
            disabled={disabled}
            onChange={(e) => onChange({ ...item, label: e.target.value })}
          />
        </FormField>
        <FormField label={t('appearance.item.target')}>
          <Select
            value={item.target}
            disabled={disabled}
            onChange={(e) => onChange({ ...item, target: e.target.value, ref: null, href: '' })}
          >
            {MENU.TARGETS.map((target) => (
              <option key={target} value={target}>
                {t(`appearance.targets.${target}`)}
              </option>
            ))}
          </Select>
        </FormField>

        {refOptions && (
          <FormField label={t(`appearance.item.ref.${item.target}`)} error={err('ref')}>
            <Select
              value={item.ref ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...item, ref: e.target.value || null })}
            >
              <option value="">{t('appearance.item.choose')}</option>
              {refOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {item.target === 'url' && (
          <FormField
            label={t('appearance.item.href')}
            description={t('appearance.item.hrefHelp')}
            error={err('href')}
          >
            <PlainTextInput
              value={item.href ?? ''}
              dir="ltr"
              disabled={disabled}
              onChange={(e) => onChange({ ...item, href: e.target.value })}
            />
          </FormField>
        )}
      </div>

      <ArabicPreview label={t('cms.builder.arabic')} value={arabic} />

      <div className="flex flex-wrap gap-3 text-xs">
        {onMoveUp && (
          <button type="button" className="underline" disabled={disabled} onClick={onMoveUp}>
            {t('common.moveUp')}
          </button>
        )}
        {onAddChild && (
          <button type="button" className="underline" disabled={disabled} onClick={onAddChild}>
            {t('appearance.item.addChild')}
          </button>
        )}
        <button type="button" className="underline" disabled={disabled} onClick={onRemove}>
          {t('common.remove')}
        </button>
      </div>

      {children}
    </li>
  );
}
