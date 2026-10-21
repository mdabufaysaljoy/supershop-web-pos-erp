import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchForm } from '@/components/SearchForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { optionLabel, useVariantSearch } from '@/lib/variants';

/** Product name · options + SKU, as shown in stock and purchasing lists. */
export function VariantLabel({ variant }) {
  if (!variant) return null;
  return (
    <span className="grid min-w-0">
      <span className="truncate text-sm">
        {variant.productName?.en}
        {optionLabel(variant) && (
          <span className="text-muted-foreground"> · {optionLabel(variant)}</span>
        )}
      </span>
      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
        {variant.sku}
      </span>
    </span>
  );
}

/**
 * Search variants by SKU, barcode or product name and add them; already-added ones are hidden.
 */
export function VariantPicker({ excludeIds, onAdd }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data = [], isFetching } = useVariantSearch(q);
  const results = data.filter((v) => !excludeIds.has(v.id));

  return (
    <div className="grid gap-2">
      <SearchForm initial={q} label={t('variantPicker.search')} onSearch={setQ} />
      {q &&
        (isFetching ? (
          <Skeleton className="h-12" />
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('variantPicker.noMatches')}</p>
        ) : (
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded border p-1">
            {results.map((v) => (
              <li key={v.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <VariantLabel variant={v} />
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAdd(v)}
                  aria-label={t('variantPicker.add', { sku: v.sku })}
                >
                  <Plus className="size-4" aria-hidden />
                  {t('common.add')}
                </Button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
