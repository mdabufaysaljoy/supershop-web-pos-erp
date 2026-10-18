import { useBarcodeScanner } from '@supershop/ui';
import { ScanBarcode } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { brands } from '@/features/brands/resource';
import { useCategories } from '@/features/categories/hooks';
import { products } from '@/features/products/resource';
import { fmt } from '@/lib/format';
import { lookupBarcode, useTillSearch } from '../resource';

/**
 * Scan-first Till Search (P6.2): matches the modern structured design with barcode input,
 * department/brand dropdown filters, and flat product list with stock and price.
 */
export function TillSearch({ branchId, onAdd, disabled }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [scanError, setScanError] = useState(null);
  const input = useRef(null);

  const { data: results = [], isFetching } = useTillSearch(q, branchId);
  const { data: categories = [] } = useCategories();
  const { data: brandList = [] } = brands.useList();
  const catalog = products.useList({ status: 'active', limit: 30 });

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

  /** Catalog items to display when search box is empty, filtered by department/brand. */
  const defaultItems = useMemo(() => {
    const list = Array.isArray(catalog.data?.items)
      ? catalog.data.items
      : Array.isArray(catalog.data)
        ? catalog.data
        : [];
    return list
      .filter((p) => {
        if (department && p.categoryId !== department && p.categories?.[0]?.id !== department) {
          return false;
        }
        if (selectedBrand && p.brandId !== selectedBrand && p.brand !== selectedBrand) {
          return false;
        }
        return true;
      })
      .map((p) => {
        const v = p.variants?.[0] || {};
        return {
          variantId: v.id || p.defaultVariantId || p.id,
          productId: p.id,
          name: p.name?.en ?? p.name ?? 'Product',
          sku: v.sku ?? p.sku ?? '',
          price: v.price ?? p.priceMin ?? 0,
          options: v.options ?? [],
          brand: p.brand?.name ?? p.brand ?? '',
          department: p.category?.name ?? p.categories?.[0]?.name ?? 'General',
          barcode: v.barcode ?? p.barcode ?? '',
          onHand: v.onHand ?? 100,
        };
      });
  }, [catalog.data, department, selectedBrand]);

  const itemsToDisplay = q.trim().length >= 2 ? results : defaultItems;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col gap-4">
      <h2 className="text-base font-bold text-slate-900">{t('pos.search.label')}</h2>

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
            if (e.key === 'Enter' && itemsToDisplay[0]) {
              e.preventDefault();
              add(itemsToDisplay[0]);
            }
            if (e.key === 'Escape') setQ('');
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <select
          value={department}
          aria-label={t('pos.departments.all')}
          onChange={(e) => setDepartment(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-primary"
        >
          <option value="">{t('pos.departments.all')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name?.en ?? c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedBrand}
          aria-label={t('pos.brands.all')}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-primary"
        >
          <option value="">{t('pos.brands.all')}</option>
          {(Array.isArray(brandList) ? brandList : []).map((b) => (
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

      {q.trim().length >= 2 && results.length === 0 && !isFetching && (
        <p className="py-6 text-center text-sm text-slate-400">{t('pos.search.nothing')}</p>
      )}

      {itemsToDisplay.length > 0 && (
        <ul className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
          {itemsToDisplay.map((item) => (
            <li key={item.variantId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => add(item)}
                className="group flex w-full items-center justify-between gap-4 rounded-xl p-3 text-start transition-colors hover:bg-slate-50/80 cursor-pointer"
              >
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-primary">
                      {item.name}
                    </span>
                    {item.options?.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">
                        {item.options.map((o) => o.value || o).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-normal text-slate-500">
                    {[item.brand, item.department || 'General', item.barcode || item.sku]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end text-end">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {fmt.money(item.price)}
                  </span>
                  <span className="text-xs font-normal text-slate-500">
                    {item.onHand != null
                      ? `${item.onHand} in stock`
                      : t('pos.search.onHand', { count: 0 })}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
