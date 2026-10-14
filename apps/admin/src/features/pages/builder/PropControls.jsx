import { FormField, IntegerInput, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { brands } from '@/features/brands/resource';
import { CategoryChecklist } from '@/features/categories/components/CategoryChecklist';
import { useCategories } from '@/features/categories/hooks';
import { parentOptions } from '@/features/categories/tree';
import { products } from '@/features/products/resource';
import { apiData } from '@/lib/apiClient';
import { Checkbox, Select } from '@/features/settings/components/controls';

/**
 * One control per prop, chosen by the `control` the registry declared (P5.3). The props panel
 * never knows about block types — add a block with a `repeater` of `media` and `text` props and it
 * is editable at once.
 *
 * Staff type English only; the generated Arabic is shown underneath, read-only (§5.7).
 */
const idList = (value) => (Array.isArray(value) ? value : []);

/** A single category, for a rail that lists one category's products. */
function CategoryControl({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const { data: list = [] } = useCategories();
  return (
    <Select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t('cms.builder.noCategory')}</option>
      {parentOptions(list).map((row) => (
        <option key={row.id} value={row.id}>
          {row.label}
        </option>
      ))}
    </Select>
  );
}

function BrandsControl({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const { data } = brands.useList({ page: 1, limit: 100 });
  const rows = data?.data ?? [];
  const chosen = idList(value);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t('brands.empty')}</p>;
  return (
    <fieldset className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2">
      <legend className="sr-only">{t('cms.builder.brands')}</legend>
      {rows.map((brand) => (
        <Checkbox
          key={brand.id}
          id={`brand-${brand.id}`}
          label={brand.name}
          checked={chosen.includes(brand.id)}
          disabled={disabled}
          onChange={() =>
            onChange(
              chosen.includes(brand.id)
                ? chosen.filter((id) => id !== brand.id)
                : [...chosen, brand.id],
            )
          }
        />
      ))}
    </fieldset>
  );
}

/**
 * Hand-picked products, in the order the admin arranged them. Chosen ids are looked up by name so
 * the list still reads properly after a reload (the page stores ids only).
 */
function ProductsControl({ value, onChange, disabled, max = 20 }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const chosen = idList(value);
  const search = products.useList(
    { page: 1, limit: 8, q: term },
    { enabled: term.trim().length > 1 },
  );
  const names = useQueries({
    queries: chosen.map((id) => ({
      queryKey: [...products.keys.all, 'detail', id],
      queryFn: () => apiData(`/api/v1/products/${id}`),
      staleTime: 60_000,
    })),
  });
  const move = (from, to) => {
    if (to < 0 || to >= chosen.length) return;
    const next = [...chosen];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <ol className="grid gap-1">
        {chosen.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
            <span className="flex-1 truncate">
              {names[i]?.data?.name?.en ?? t('cms.builder.productLoading')}
            </span>
            <button
              type="button"
              className="text-xs underline"
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
            >
              {t('common.moveUp')}
            </button>
            <button
              type="button"
              className="text-xs underline"
              disabled={disabled}
              onClick={() => onChange(chosen.filter((x) => x !== id))}
            >
              {t('common.remove')}
            </button>
          </li>
        ))}
      </ol>
      <PlainTextInput
        value={term}
        disabled={disabled || chosen.length >= max}
        placeholder={t('cms.builder.searchProducts')}
        onChange={(e) => setTerm(e.target.value)}
      />
      {(search.data?.data ?? [])
        .filter((p) => !chosen.includes(p.id))
        .map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-md border px-2 py-1 text-start text-sm hover:bg-muted"
            disabled={disabled || chosen.length >= max}
            onClick={() => {
              onChange([...chosen, p.id]);
              setTerm('');
            }}
          >
            {p.name?.en ?? p.slug}
          </button>
        ))}
    </div>
  );
}

/** Picks the control a prop asked for. `onPickMedia` opens the shared media dialog. */
export function PropControl({ editor, value, onChange, disabled, onPickMedia, arabic }) {
  const { t } = useTranslation();
  const common = { label: editor.label, description: editor.help };
  const showArabic = arabic !== undefined;

  const field = () => {
    switch (editor.control) {
      case 'select':
        return (
          <Select
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {editor.options.map((option) => (
              <option key={option} value={option}>
                {t(`cms.builder.options.${option}`, option)}
              </option>
            ))}
          </Select>
        );
      case 'number':
        return (
          <IntegerInput
            value={value ?? ''}
            min={editor.min}
            max={editor.max}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        );
      case 'datetime':
        return (
          <input
            type="datetime-local"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            // The schema wants an offset; the browser gives local time without one.
            value={value ? new Date(value).toISOString().slice(0, 16) : ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
          />
        );
      case 'richText':
      case 'textarea':
      case 'code':
        return (
          <PlainTextArea
            rows={editor.control === 'code' ? 8 : 6}
            className={editor.control === 'code' ? 'font-mono text-xs' : undefined}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'media':
        return (
          <div className="grid gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={onPickMedia}>
              {value ? t('cms.builder.changeImage') : t('cms.builder.chooseImage')}
            </Button>
            {value && (
              <button
                type="button"
                className="justify-self-start text-xs underline"
                disabled={disabled}
                onClick={() => onChange(null)}
              >
                {t('cms.builder.removeImage')}
              </button>
            )}
          </div>
        );
      case 'category':
        return <CategoryControl value={value} onChange={onChange} disabled={disabled} />;
      case 'categories':
        return (
          <CategoryChecklist
            value={idList(value)}
            max={12}
            label={editor.label}
            onChange={onChange}
          />
        );
      case 'brands':
        return <BrandsControl value={value} onChange={onChange} disabled={disabled} />;
      case 'products':
        return <ProductsControl value={value} onChange={onChange} disabled={disabled} />;
      default:
        return (
          <PlainTextInput
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div className="grid gap-2">
      <FormField {...common}>{field()}</FormField>
      {showArabic && <ArabicPreview label={t('cms.builder.arabic')} value={arabic} />}
    </div>
  );
}

/**
 * A list of repeated items (slides, questions, selling points). Each item is edited with the same
 * controls as a top-level prop, so nothing here is specific to a block.
 */
export function Repeater({ editor, items, onChange, disabled, onPickMedia, arabicFor }) {
  const { t } = useTranslation();
  const rows = Array.isArray(items) ? items : [];
  const max = editor.max ?? 10;
  const write = (index, name, value) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [name]: value } : row)));
  const move = (from, to) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">{editor.label}</h3>
      {rows.map((row, index) => (
        <fieldset key={index} className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 text-xs text-muted-foreground">
            {editor.itemLabel} {index + 1}
          </legend>
          {editor.itemEditors.map((item) => (
            <PropControl
              key={item.name}
              editor={item}
              value={row[item.name]}
              disabled={disabled}
              arabic={arabicFor?.(index, item.name)}
              onPickMedia={() => onPickMedia(`${editor.name}.${index}.${item.name}`)}
              onChange={(next) => write(index, item.name, next)}
            />
          ))}
          <div className="flex gap-3">
            <button
              type="button"
              className="text-xs underline"
              disabled={disabled || index === 0}
              onClick={() => move(index, index - 1)}
            >
              {t('common.moveUp')}
            </button>
            <button
              type="button"
              className="text-xs underline"
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              {t('common.remove')}
            </button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || rows.length >= max}
        onClick={() => onChange([...rows, { ...editor.itemDefaults }])}
      >
        {t('cms.builder.addItem', { item: editor.itemLabel })}
      </Button>
    </div>
  );
}
