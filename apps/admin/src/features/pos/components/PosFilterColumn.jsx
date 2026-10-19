import { RotateCcw, ScanBarcode, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * POS Column 1: Filter Options Column
 * Dedicated column for scanner input, search keyword, department filter, brand filter, and branch switcher.
 */
export function PosFilterColumn({
  q,
  onQChange,
  onSearchSubmit,
  department,
  onDepartmentChange,
  selectedBrand,
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
}) {
  const { t } = useTranslation();
  const hasActiveFilters = Boolean(q || department || selectedBrand);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SlidersHorizontal className="size-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('pos.filters.title', 'Filters')}
          </h2>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-primary transition-colors"
          >
            <RotateCcw className="size-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3.5 pe-1">
        {/* Optional Branch Switcher */}
        {branchOptions.length > 1 && onSelectBranch && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="pos-branch-switcher"
              className="text-[11px] font-semibold text-slate-500"
            >
              {t('pos.branch', 'Branch')}
            </label>
            <select
              id="pos-branch-switcher"
              value={branchId}
              disabled={linesCount > 0}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-primary"
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scan Barcode / Keyword Input */}
        <div className="flex flex-col gap-1">
          <label htmlFor="till-search" className="text-[11px] font-semibold text-slate-500">
            {t('pos.search.label', 'Scan or search')}
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-primary">
              <ScanBarcode className="size-4" />
            </div>
            <input
              id="till-search"
              ref={inputRef}
              value={q}
              disabled={disabled}
              autoComplete="off"
              placeholder={t('pos.search.placeholder', 'Barcode, SKU or product name')}
              className="h-10 w-full rounded-md border border-primary/50 bg-white ps-9 pe-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs"
              onChange={(e) => onQChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onQChange('');
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSearchSubmit?.(q);
                }
              }}
            />
          </div>
          {scanError && (
            <p role="alert" className="text-[11px] font-medium text-destructive mt-1">
              {t('pos.search.unknownCode', { code: scanError })}
            </p>
          )}
        </div>

        {/* Departments Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-department" className="text-[11px] font-semibold text-slate-500">
            {t('pos.departments.label', 'Department')}
          </label>
          <select
            id="filter-department"
            value={department}
            aria-label={t('pos.departments.all', 'All departments')}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-primary shadow-2xs"
          >
            <option value="">{t('pos.departments.all', 'All departments')}</option>
            {categories.map((c) => (
              <option key={c.id || c._id} value={c.id || c._id}>
                {c.name?.en ?? c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Brands Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-brand" className="text-[11px] font-semibold text-slate-500">
            {t('pos.brands.label', 'Brand')}
          </label>
          <select
            id="filter-brand"
            value={selectedBrand}
            aria-label={t('pos.brands.all', 'All brands')}
            onChange={(e) => onSelectedBrandChange(e.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-primary shadow-2xs"
          >
            <option value="">{t('pos.brands.all', 'All brands')}</option>
            {brandList.map((b) => (
              <option key={b.id || b._id} value={b.id || b._id}>
                {b.name?.en ?? b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bottom Info / Clear */}
      {hasActiveFilters && (
        <div className="pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetFilters}
            className="w-full h-8 text-[11px] font-semibold rounded-md text-slate-600"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
