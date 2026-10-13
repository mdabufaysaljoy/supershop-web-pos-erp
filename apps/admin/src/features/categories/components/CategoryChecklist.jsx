import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useCategories } from '../hooks';
import { parentOptions } from '../tree';

/**
 * Pick categories from the tree (indented checkboxes). Order = order of ticking; the first one is
 * the product's main category (breadcrumbs, canonical URL).
 */
export function CategoryChecklist({ value, onChange, max = 10, label }) {
  const { t } = useTranslation();
  const { data: list = [] } = useCategories();
  const rows = parentOptions(list);
  const toggle = (id) =>
    onChange(
      value.includes(id)
        ? value.filter((v) => v !== id)
        : value.length < max
          ? [...value, id]
          : value,
    );
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t('categories.empty')}</p>;
  return (
    <fieldset className="max-h-64 overflow-y-auto rounded-md border p-2">
      <legend className="sr-only">{label}</legend>
      {rows.map((r) => (
        <label
          key={r.id}
          className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
          style={{ paddingInlineStart: `${0.25 + r.depth * 1.25}rem` }}
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={value.includes(r.id)}
            onChange={() => toggle(r.id)}
          />
          <span className="truncate">{r.label}</span>
          {value[0] === r.id && <Badge tone="ok">{t('products.form.mainCategory')}</Badge>}
        </label>
      ))}
    </fieldset>
  );
}
