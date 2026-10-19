import { useBarcodeScanner } from '@supershop/ui';
import { Plus, ScanBarcode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { brands } from '@/features/brands/resource';
import { useCategories } from '@/features/categories/hooks';
import { fmt } from '@/lib/format';
import { lookupBarcode, useTillSearch } from '../resource';

/**
 * Scan-first Till Search (P6.2): matches modern structured layout with barcode/text input,
 * department & brand dropdown filters, and an interactive catalogue grid occupying the workspace.
 */
export function TillSearch({
  branchId,
  onAdd,
  disabled,
  branchOptions = [],
  onSelectBranch,
  linesCount = 0,
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [scanError, setScanError] = useState(null);
  const input = useRef(null);

  const { data: results = [], isFetching } = useTillSearch({
    q,
    branchId,
    categoryId: department,
    brandId: selectedBrand,
  });

  const { data: categoriesRaw } = useCategories();
  const { data: brandListRaw } = brands.useList();

  const categories = categoriesRaw?.data ?? (Array.isArray(categoriesRaw) ? categoriesRaw : []);
  const brandList = brandListRaw?.data ?? (Array.isArray(brandListRaw) ? brandListRaw : []);

  useEffect(() => {
    input.current?.focus();
  }, []);

  /** A scanner is a keyboard that types very fast and presses Enter (P1.6). */
  useBarcodeScanner({
    enabled: !disabled,
    onScan: async (code) => {
      setScanError(null);
      try {
        const { variant, product } = await lookupBarcode(code);
        onAdd({
          variantId: variant.id,
          productId: product.id,
          name: product.name?.en ?? product.name ?? '',
          sku: variant.sku,
          price: variant.price,
          options: variant.options ?? [],
        });
      } catch {
        setScanError(code);
      }
    },
  });

  const add = (item) => {
    onAdd(item);
    setQ('');
    input.current?.focus();
  };

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col gap-4">
      {/* Header: Scan or search title & optional compact branch switcher */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{t('pos.search.label')}</h2>
        {branchOptions.length > 1 && onSelectBranch && (
          <div className="flex items-center gap-2">
            <label htmlFor="pos-branch-switcher" className="text-xs font-semibold text-slate-500">
              {t('pos.branch')}:
            </label>
            <select
              id="pos-branch-switcher"
              value={branchId}
              disabled={linesCount > 0}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-primary"
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Barcode / Keyword Input */}
      <div className="relative">
        <label htmlFor="till-search" className="sr-only">
          {t('pos.search.label')}
        </label>
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-primary">
          <ScanBarcode className="size-5" />
        </div>
        <input
          id="till-search"
          ref={input}
          value={q}
          disabled={disabled}
          autoComplete="off"
          placeholder={t('pos.search.placeholder')}
          className="h-12 w-full rounded-xl border border-primary/50 bg-white ps-11 pe-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault();
              add(results[0]);
            }
            if (e.key === 'Escape') setQ('');
          }}
        />
      </div>

      {/* Filter Dropdowns: Departments & Brands */}
      <div className="grid grid-cols-2 gap-3">
        <select
          value={department}
          aria-label={t('pos.departments.all', 'All departments')}
          onChange={(e) => setDepartment(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-primary"
        >
          <option value="">{t('pos.departments.all', 'All departments')}</option>
          {categories.map((c) => (
            <option key={c.id || c._id} value={c.id || c._id}>
              {c.name?.en ?? c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedBrand}
          aria-label={t('pos.brands.all', 'All brands')}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-primary"
        >
          <option value="">{t('pos.brands.all', 'All brands')}</option>
          {brandList.map((b) => (
            <option key={b.id || b._id} value={b.id || b._id}>
              {b.name?.en ?? b.name}
            </option>
          ))}
        </select>
      </div>

      {scanError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('pos.search.unknownCode', { code: scanError })}
        </p>
      )}

      {/* Interactive Product Catalogue Grid in the Blank Workspace */}
      <div className="min-h-[380px] max-h-[580px] overflow-y-auto">
        {isFetching && !results.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 p-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <p className="text-sm font-medium">{t('pos.search.nothing', 'No products found.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 p-1">
            {results.map((item) => (
              <button
                key={item.variantId}
                type="button"
                disabled={disabled}
                onClick={() => add(item)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3 text-start transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.98] cursor-pointer"
              >
                <div>
                  {/* Thumbnail / Placeholder */}
                  <div className="relative aspect-square w-full mb-2.5 overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center">
                    {item.image?.url ? (
                      <img
                        src={item.image.url}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-xl font-bold uppercase text-slate-300">
                        {item.name?.slice(0, 2) || 'PR'}
                      </span>
                    )}
                    <span
                      className={`absolute top-1.5 end-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        (item.onHand ?? 0) > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {(item.onHand ?? 0) > 0 ? `${item.onHand}` : '0'}
                    </span>
                  </div>

                  {/* Product Name */}
                  <h3 className="line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-primary transition-colors">
                    {item.name}
                  </h3>

                  {/* Options or SKU */}
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    {item.options?.length > 0 ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        {item.options.map((o) => o.value || o).join(', ')}
                      </span>
                    ) : (
                      <span className="truncate font-mono text-[10px] text-slate-400">
                        {item.sku}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price & Quick Add */}
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                    {fmt.money(item.price)}
                  </span>
                  <span className="rounded-md bg-primary/10 p-1 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Plus className="size-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
