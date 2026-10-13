'use client';

import { useT } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { valueState } from './variants';

/**
 * Option pickers (swatches or text buttons). Combinations that don't exist are disabled;
 * values that exist but are sold out are struck through and announced as such.
 */
export function VariantOptions({ product, selection, onChoose }) {
  const t = useT();
  return product.options.map((o) => (
    <fieldset key={o.key} className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">
        {o.name}
        {selection[o.key] && (
          <span className="font-normal text-muted-foreground">
            {': '}
            {o.values.find((v) => v.key === selection[o.key])?.label}
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {o.values.map((v) => {
          const state = valueState(product, selection, o.key, v.key);
          const selected = selection[o.key] === v.key;
          const label =
            state === 'out' ? t('catalog.valueOutOfStock', { value: v.label }) : v.label;
          return (
            <button
              key={v.key}
              type="button"
              aria-pressed={selected}
              aria-label={v.swatch ? label : undefined}
              title={v.swatch ? label : undefined}
              disabled={state === 'unavailable'}
              onClick={() => onChoose(o.key, v.key)}
              className={cn(
                'relative rounded-md border text-sm transition-[color,box-shadow,border-color] disabled:cursor-not-allowed disabled:opacity-40',
                v.swatch ? 'size-10 rounded-full p-1' : 'min-h-10 px-3',
                selected ? 'border-primary ring-2 ring-primary/30' : 'hover:border-foreground/40',
                state === 'out' && 'text-muted-foreground line-through',
              )}
            >
              {v.swatch ? (
                <span
                  className="block size-full rounded-full border"
                  style={{ backgroundColor: v.swatch }}
                />
              ) : (
                v.label
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  ));
}
