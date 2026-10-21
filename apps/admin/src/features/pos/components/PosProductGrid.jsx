import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Layers,
  Receipt,
  RotateCcw,
  Scan,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt } from '@/lib/format';

const PAGE_SIZE = 50;

/**
 * POS Search, Filter & 2-Column Products Section
 * Renders the top search bar with F2 shortcut & Scan button,
 * category & brand filters, and 2-column scrollable product cards grid
 * with dynamic pagination when items exceed 50.
 */
export function PosProductGrid({
  // Search & Filter props
  q = '',
  onQChange,
  onSearchSubmit,
  department = '',
  onDepartmentChange,
  selectedBrand = '',
  onSelectedBrandChange,
  categories = [],
  brandList = [],
  branchId,
  branchOptions = [],
  onSelectBranch,
  linesCount = 0,
  disabled = false,
  scanError = null,
  inputRef,
  onResetFilters,
  onOpenRecentSales,

  // Products props
  results = [],
  isFetching = false,
  onAdd,
  page = 1,
  onPageChange,
}) {
  const { t } = useTranslation();

  const brandMap = useMemo(() => {
    return new Map(brandList.map((b) => [String(b.id || b._id), b.name?.en ?? b.name]));
  }, [brandList]);

  const hasActiveFilters = Boolean(q || department || selectedBrand);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return results.slice(start, start + PAGE_SIZE);
  }, [results, currentPage]);

  const startCount = results.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endCount = Math.min(currentPage * PAGE_SIZE, results.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [totalPages, currentPage]);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Row 1: Search Input + Scan Button */}
      <div className="flex items-center gap-2 w-full shrink-0">
        <div className="relative flex-1">
          <label htmlFor="till-search" className="sr-only">
            {t('pos.search.label', 'Scan or search')}
          </label>
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
            <Search className="size-4" />
          </div>
          <input
            id="till-search"
            ref={inputRef}
            value={q}
            disabled={disabled}
            autoComplete="off"
            aria-label={t('pos.search.label', 'Scan or search')}
            placeholder={t(
              'pos.search.placeholderF2',
              'Search by name, SKU or scan a barcode... (F2)',
            )}
            className="h-11 w-full rounded-lg border border-blue-500 bg-white ps-10 pe-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 shadow-2xs"
            onChange={(e) => onQChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onQChange?.('');
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearchSubmit?.(q);
              }
            }}
          />
        </div>

        {/* Scan Action Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (q?.trim()) {
              onSearchSubmit?.(q);
            } else {
              inputRef?.current?.focus();
            }
          }}
          className="h-11 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm flex items-center gap-2 shrink-0 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Scan className="size-4" />
          <span>{t('pos.search.scan', 'Scan')}</span>
        </button>
      </div>

      {/* Row 2: Category Dropdown & Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-3 shrink-0">
        {/* All Categories Dropdown */}
        <div className="relative inline-flex items-center">
          <label htmlFor="filter-department" className="sr-only">
            {t('pos.categories.all', 'All categories')}
          </label>
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-slate-500">
            <Tag className="size-3.5" />
          </div>
          <select
            id="filter-department"
            value={department}
            aria-label={t('pos.departments.all', 'All categories')}
            onChange={(e) => onDepartmentChange?.(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-slate-200/90 bg-white ps-8 pe-8 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-2xs cursor-pointer"
          >
            <option value="">{t('pos.categories.all', 'All categories')}</option>
            {categories.map((c) => (
              <option key={c.id || c._id} value={c.id || c._id}>
                {c.name?.en ?? c.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2.5 text-slate-400">
            <ChevronDown className="size-3.5" />
          </div>
        </div>

        {/* All Brands Dropdown (accessible for filter/test) */}
        {brandList.length > 0 && (
          <div className="relative inline-flex items-center">
            <label htmlFor="filter-brand" className="sr-only">
              {t('pos.brands.all', 'All brands')}
            </label>
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-slate-500">
              <SlidersHorizontal className="size-3.5" />
            </div>
            <select
              id="filter-brand"
              value={selectedBrand}
              aria-label={t('pos.brands.all', 'All brands')}
              onChange={(e) => onSelectedBrandChange?.(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-slate-200/90 bg-white ps-8 pe-8 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-2xs cursor-pointer"
            >
              <option value="">{t('pos.brands.all', 'All brands')}</option>
              {brandList.map((b) => (
                <option key={b.id || b._id} value={b.id || b._id}>
                  {b.name?.en ?? b.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2.5 text-slate-400">
              <ChevronDown className="size-3.5" />
            </div>
          </div>
        )}

        {/* Branch Switcher (if multiple branches available) */}
        {branchOptions.length > 1 && onSelectBranch && (
          <div className="relative inline-flex items-center">
            <label htmlFor="pos-branch-switcher" className="sr-only">
              {t('pos.branch', 'Branch')}
            </label>
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-slate-500">
              <Store className="size-3.5" />
            </div>
            <select
              id="pos-branch-switcher"
              value={branchId}
              disabled={linesCount > 0}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-slate-200/90 bg-white ps-8 pe-8 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-2xs cursor-pointer"
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2.5 text-slate-400">
              <ChevronDown className="size-3.5" />
            </div>
          </div>
        )}

        {/* Reset active filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary transition-colors px-2 py-1 cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>{t('common.reset', 'Reset')}</span>
          </button>
        )}

        {/* Recent sales modal launcher */}
        {onOpenRecentSales && (
          <button
            type="button"
            onClick={onOpenRecentSales}
            className="ms-auto flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-primary transition-colors py-1 cursor-pointer"
          >
            <Receipt className="size-3.5 text-slate-500" />
            <span>{t('pos.recentSales', 'Recent Sales')}</span>
          </button>
        )}
      </div>

      {scanError && (
        <p role="alert" className="text-xs font-medium text-destructive mt-1.5 shrink-0">
          {t('pos.search.unknownCode', { code: scanError })}
        </p>
      )}

      {/* Subtle Horizontal Divider */}
      <div className="border-b border-slate-100 my-3 shrink-0" />

      {/* 2-Column Product Grid Area (Scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto pe-1">
        {isFetching && !results.length ? (
          <div className="grid grid-cols-2 gap-2.5 p-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center text-slate-400">
            <ImageOff className="size-12 stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-medium">{t('pos.search.nothing', 'No products found.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 p-0.5">
            {paginatedItems.map((item) => {
              const brandName =
                brandMap.get(String(item.brandId)) || item.brandName || item.brand || '';
              const variantCount = item.variantCount ?? (item.options?.length || 1);
              const displayOptions =
                item.optionValues?.length > 0
                  ? item.optionValues.slice(0, 3)
                  : item.options?.length > 0
                    ? item.options.map((o) => o.value || o).slice(0, 3)
                    : [];

              return (
                <button
                  key={item.variantId}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(item)}
                  className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 text-start transition-all hover:border-slate-300 hover:shadow-xs active:scale-[0.99] cursor-pointer"
                >
                  <div>
                    {/* Balanced Image Box */}
                    <div className="relative h-36 w-full rounded-lg bg-slate-100/90 flex items-center justify-center overflow-hidden">
                      {item.image?.url ? (
                        <img
                          src={item.image.url}
                          alt={item.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <ImageOff className="size-8 text-slate-300 stroke-[1.2]" />
                      )}

                      {/* Top Right Layers Badge */}
                      <div className="absolute top-2 end-2 flex items-center gap-1 rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        <Layers className="size-3 stroke-[2.2]" />
                        <span>{variantCount}</span>
                      </div>
                    </div>

                    {/* Product Name */}
                    <h3 className="mt-2 text-xs font-semibold text-slate-900 line-clamp-1 group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>

                    {/* Brand / Subtitle */}
                    {brandName && (
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">{brandName}</p>
                    )}

                    {/* Variant Option Pills */}
                    {displayOptions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {displayOptions.map((opt, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200 bg-white"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Price & Stock */}
                  <div className="mt-2 pt-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 tabular-nums">
                      {fmt.money(item.price)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                      {item.onHand ?? 0}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Dynamic Pagination Controls (Shown only if products > 50) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 tabular-nums">
              {startCount}-{endCount} of {results.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="size-7 p-0 rounded-md text-slate-600 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </Button>

            {pageNumbers.map((p, idx) =>
              p === '...' ? (
                <span key={`dots-${idx}`} className="px-1 text-xs text-slate-400">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  type="button"
                  variant={p === currentPage ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPageChange(p)}
                  className={`size-7 p-0 rounded-md text-xs font-semibold tabular-nums ${
                    p === currentPage
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  aria-label={`Page ${p}`}
                  aria-current={p === currentPage ? 'page' : undefined}
                >
                  {p}
                </Button>
              ),
            )}

            <span className="px-1.5 text-xs font-bold text-slate-700 tabular-nums">
              {currentPage} / {totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="size-7 p-0 rounded-md text-slate-600 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
