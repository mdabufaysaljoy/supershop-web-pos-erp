import { SEARCH } from '@supershop/shared';
import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';
import { listingHref } from '@/lib/listing';
import { FiltersPanel } from './FiltersPanel';
import { ListingPagination } from './ListingPagination';
import { ProductGrid } from './ProductCard';
import { SortSelect } from './SortSelect';

/**
 * Listing page body shared by category, search and "all products": filters (a plain GET form —
 * works without JavaScript and keeps URLs crawlable), sort, grid and pagination.
 * @param {object} p
 * @param {string} p.path      localized page path (no query)
 * @param {ReturnType<import('@/lib/listing').parseListing>} p.listing
 * @param {{ data: object[], meta: { total: number, facets: object } }} p.result
 * @param {{ id: string, name: string, slug: string }[]} [p.subcategories]
 * @param {boolean} [p.categoryFacet]  search pages: filter by category
 */
export function ListingView({
  path,
  listing,
  result,
  lang,
  t,
  fmt,
  subcategories = [],
  categoryFacet = false,
  header,
}) {
  const { total, facets = {} } = result.meta;
  const sortOptions = [
    { value: '', label: t(listing.q ? 'catalog.sort.relevance' : 'catalog.sort.default') },
    ...SEARCH.SORTS.filter((s) => s !== 'relevance').map((s) => ({
      value: s,
      label: t(`catalog.sort.${s}`),
    })),
  ].map((o) => ({ ...o, href: listingHref(path, listing, { sort: o.value || null }) }));
  const active =
    listing.brands.length +
    (listing.min != null || listing.max != null ? 1 : 0) +
    (listing.category ? 1 : 0);
  const clearHref = listingHref(path, {
    ...listing,
    brands: [],
    min: null,
    max: null,
    category: null,
  });

  return (
    <div className="grid gap-6">
      {header}
      <div className="grid gap-6 md:grid-cols-[15rem_1fr] md:items-start">
        <aside aria-label={t('catalog.filters')}>
          <FiltersPanel label={t('catalog.filters')} activeCount={active}>
            <div className="grid gap-6">
              {subcategories.length > 0 && (
                <section className="grid gap-2">
                  <h2 className="text-sm font-semibold">{t('catalog.subcategories')}</h2>
                  <ul className="grid gap-1 text-sm">
                    {subcategories.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={localizePath(categoryPath(c.slug), lang)}
                          className="hover:underline"
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {categoryFacet && facets.categories?.length > 0 && (
                <section className="grid gap-2">
                  <h2 className="text-sm font-semibold">{t('catalog.categories')}</h2>
                  <ul className="grid gap-1 text-sm">
                    {facets.categories.slice(0, 12).map((c) => (
                      <li key={c.id}>
                        <Link
                          href={listingHref(path, listing, {
                            category: listing.category === c.id ? null : c.id,
                          })}
                          aria-current={listing.category === c.id ? 'true' : undefined}
                          className="flex justify-between gap-2 hover:underline aria-[current]:font-semibold"
                        >
                          <span>{c.name}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {fmt.number(c.count)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <form method="get" action={path} className="grid gap-6">
                {listing.q && <input type="hidden" name="q" value={listing.q} />}
                {listing.sort && <input type="hidden" name="sort" value={listing.sort} />}
                {listing.category && (
                  <input type="hidden" name="category" value={listing.category} />
                )}
                {facets.brands?.length > 0 && (
                  <fieldset className="grid gap-2">
                    <legend className="mb-2 text-sm font-semibold">{t('catalog.brands')}</legend>
                    {facets.brands.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="brands"
                          value={b.id}
                          defaultChecked={listing.brands.includes(b.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="flex-1">{b.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {fmt.number(b.count)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-semibold">{t('catalog.price')}</legend>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name="min"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      dir="ltr"
                      aria-label={t('catalog.minPrice')}
                      placeholder={
                        facets.price ? String(Math.floor(facets.price.min / 100)) : t('catalog.min')
                      }
                      defaultValue={listing.min ?? ''}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="number"
                      name="max"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      dir="ltr"
                      aria-label={t('catalog.maxPrice')}
                      placeholder={
                        facets.price ? String(Math.ceil(facets.price.max / 100)) : t('catalog.max')
                      }
                      defaultValue={listing.max ?? ''}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('catalog.priceInSar')}</p>
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    {t('catalog.apply')}
                  </button>
                  {active > 0 && (
                    <Link href={clearHref} className="text-sm underline underline-offset-4">
                      {t('catalog.clear')}
                    </Link>
                  )}
                </div>
              </form>
            </div>
          </FiltersPanel>
        </aside>

        <section aria-label={t('catalog.results')} className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {t('catalog.count', { count: fmt.number(total) })}
            </p>
            <SortSelect
              value={listing.sort ?? ''}
              options={sortOptions}
              label={t('catalog.sortBy')}
            />
          </div>
          {result.data.length === 0 ? (
            <div className="grid gap-2 rounded-lg border border-dashed p-10 text-center">
              <p className="font-medium">{t('catalog.empty')}</p>
              {active > 0 && (
                <Link href={clearHref} className="text-sm underline underline-offset-4">
                  {t('catalog.clear')}
                </Link>
              )}
            </div>
          ) : (
            <ProductGrid products={result.data} lang={lang} fmt={fmt} t={t} />
          )}
          <ListingPagination path={path} listing={listing} total={total} t={t} />
        </section>
      </div>
    </div>
  );
}
