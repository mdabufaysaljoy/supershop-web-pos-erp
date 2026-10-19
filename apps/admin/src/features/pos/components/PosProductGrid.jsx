import { ChevronLeft, ChevronRight, Package, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt } from '@/lib/format';

const PAGE_SIZE = 50;

/**
 * POS Column 2: Product Showing View (2 Columns of cards)
 * Displays products in a 2-column grid with exactly 50 items per page and bottom pagination.
 */
export function PosProductGrid({
  results = [],
  isFetching = false,
  onAdd,
  disabled = false,
  page = 1,
  onPageChange,
}) {
  const { t } = useTranslation();

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return results.slice(start, start + PAGE_SIZE);
  }, [results, currentPage]);

  const startCount = results.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endCount = Math.min(currentPage * PAGE_SIZE, results.length);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-slate-200/90 bg-white p-4 shadow-2xs">
      {/* Header with Item Count */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
            <Package className="size-3.5" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('pos.products.title', 'Products')}
          </h2>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {results.length} item{results.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* 2-Column Product Grid Area */}
      <div className="flex-1 min-h-0 overflow-y-auto pe-1">
        {isFetching && !results.length ? (
          <div className="grid grid-cols-2 gap-2.5 p-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-md" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center text-slate-400">
            <Package className="size-10 stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-medium">{t('pos.search.nothing', 'No products found.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 p-0.5">
            {paginatedItems.map((item) => (
              <button
                key={item.variantId}
                type="button"
                disabled={disabled}
                onClick={() => onAdd(item)}
                className="group flex flex-col justify-between rounded-md border border-slate-200/90 bg-white p-3 text-start transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.98] cursor-pointer"
              >
                <div>
                  {/* Thumbnail / Initials Placeholder */}
                  <div className="relative aspect-square w-full mb-2 overflow-hidden rounded-md bg-slate-100 flex items-center justify-center">
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
                      className={`absolute top-1.5 end-1.5 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
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
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                    {item.options?.length > 0 ? (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 truncate max-w-full">
                        {item.options.map((o) => o.value || o).join(', ')}
                      </span>
                    ) : (
                      <span className="truncate font-mono text-slate-400">{item.sku}</span>
                    )}
                  </div>
                </div>

                {/* Price & Quick Add */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                    {fmt.money(item.price)}
                  </span>
                  <span className="rounded-sm bg-primary/10 p-1 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Plus className="size-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Pagination Controls (50 items per page) */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-2">
        <span className="text-[11px] text-slate-500 tabular-nums">
          {results.length ? `${startCount}-${endCount} of ${results.length}` : '0 products'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="size-7 p-0 rounded-md text-slate-600"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="px-2 text-xs font-bold text-slate-700 tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="size-7 p-0 rounded-md text-slate-600"
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
