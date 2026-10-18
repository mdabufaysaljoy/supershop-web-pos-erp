import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';

/**
 * The header's primary navigation row:
 * - Standalone All Products
 * - Interactive Categories dropdown listing all categories
 * - Offers & Deals showcase with high-visibility badge
 * - Standalone Order Tracking link (separated from shop dropdown)
 * - Any shop-arranged menu items
 *
 * Items with children open accessible panels on hover and focus.
 */
const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

const topLinkStyle =
  'inline-flex items-center gap-1.5 border-b-2 border-transparent py-2.5 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground';

export function SiteNav({ items = [], categories = [], lang, label, t }) {
  if (!items.length && !categories.length) return null;

  // 1. Remove track order if it was nested under any parent item (e.g. Shop)
  const cleanedItems = items.map((item) => {
    if (item.children?.length) {
      const filteredChildren = item.children.filter(
        (child) =>
          !child.href?.includes('/track') &&
          !child.label?.toLowerCase().includes('track') &&
          child.id !== 'track',
      );
      return { ...item, children: filteredChildren };
    }
    return item;
  });

  const hasItemWithHref = (path) =>
    cleanedItems.some((i) => i.href === path || i.href?.endsWith(path));

  // Determine if we need to inject Categories, Offers, or Track Order
  const hasCategoriesItem = cleanedItems.some(
    (i) => i.id === 'categories' || i.label?.toLowerCase() === 'categories',
  );
  const hasOffersItem =
    hasItemWithHref('/search?sort=price_asc') || cleanedItems.some((i) => i.id === 'offers');
  const hasTrackItem = hasItemWithHref('/track') || cleanedItems.some((i) => i.id === 'track');

  return (
    <nav aria-label={label} className="mx-auto max-w-7xl px-4">
      <ul className="-mb-px flex flex-wrap items-center gap-6 text-sm">
        {/* Render arranged items */}
        {cleanedItems.map((item) => {
          const isOffers = item.id === 'offers' || item.href?.includes('sort=price_asc');
          const isTrack = item.id === 'track' || item.href === '/track';

          return item.children?.length ? (
            <li key={item.id} className="group relative">
              <Link
                href={linkHref(item.href ?? '#', lang)}
                className={`${topLinkStyle} group-hover:text-foreground`}
                aria-haspopup="true"
              >
                <span>{item.label}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 transition-transform group-hover:rotate-180"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Link>
              <div className="invisible absolute start-0 top-full z-50 min-w-56 rounded-xl border bg-background p-3 opacity-0 shadow-xl transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul className="grid gap-1">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={linkHref(child.href, lang)}
                        className="block rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ) : (
            <li key={item.id}>
              <Link
                href={linkHref(item.href, lang)}
                className={`${topLinkStyle} ${isOffers ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}
              >
                {isTrack && <span aria-hidden="true">📦</span>}
                {isOffers && <span aria-hidden="true">🔥</span>}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}

        {/* Categories Dropdown if not in items list and categories are present */}
        {!hasCategoriesItem && categories.length > 0 && (
          <li className="group relative">
            <button
              type="button"
              className={`${topLinkStyle} group-hover:text-foreground cursor-pointer`}
              aria-haspopup="true"
            >
              <span aria-hidden="true">📑</span>
              <span>{t ? t('catalog.categories') : 'Categories'}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 transition-transform group-hover:rotate-180"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div className="invisible absolute start-0 top-full z-50 min-w-64 rounded-2xl border bg-background p-3 opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="p-2 border-b border-border/60 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Browse Departments
                </p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={localizePath(categoryPath(c.slug), lang)}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="truncate">{c.name}</span>
                      <span aria-hidden="true" className="text-[10px] opacity-60">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )}

        {/* Standalone Offers Link if not in items */}
        {!hasOffersItem && (
          <li>
            <Link
              href={`${localizePath('/search', lang)}?sort=price_asc`}
              className={`${topLinkStyle} text-amber-600 dark:text-amber-400 font-semibold`}
            >
              <span aria-hidden="true">🔥</span>
              <span>Offers</span>
            </Link>
          </li>
        )}

        {/* Standalone Track Order Option if not in items */}
        {!hasTrackItem && (
          <li className="ms-auto">
            <Link
              href={localizePath('/track', lang)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              <span aria-hidden="true">📦</span>
              <span>{t ? t('track.linkLabel') : 'Track Order'}</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
