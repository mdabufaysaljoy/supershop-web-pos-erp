import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';

const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

const topLinkStyle =
  'inline-flex items-center gap-1.5 border-b-2 border-transparent py-2.5 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground';

/**
 * Visual metadata for departments (high-res background images and large icons)
 */
function getCategoryVisual(name = '', slug = '') {
  const s = `${slug} ${name}`.toLowerCase();
  if (
    s.includes('mobile') ||
    s.includes('phone') ||
    s.includes('smartphones') ||
    s.includes('gadget')
  ) {
    return {
      icon: '📱',
      tag: 'Flagships, Cases, Chargers & MagSafe',
      bgImg:
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    };
  }
  if (
    s.includes('audio') ||
    s.includes('headphone') ||
    s.includes('sound') ||
    s.includes('earbud') ||
    s.includes('wearable')
  ) {
    return {
      icon: '🎧',
      tag: 'Spatial Audio, ANC Buds & Speakers',
      bgImg:
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    };
  }
  if (s.includes('comput') || s.includes('laptop') || s.includes('tech') || s.includes('gaming')) {
    return {
      icon: '💻',
      tag: 'Ultrabooks, 4K Displays & Mechanical Keys',
      bgImg:
        'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    };
  }
  if (
    s.includes('fashion') ||
    s.includes('apparel') ||
    s.includes('cloth') ||
    s.includes('hoodie') ||
    s.includes('streetwear')
  ) {
    return {
      icon: '👕',
      tag: 'Seasonal Streetwear, Hoodies & Footwear',
      bgImg:
        'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    };
  }
  if (
    s.includes('home') ||
    s.includes('living') ||
    s.includes('smart-home') ||
    s.includes('appliance')
  ) {
    return {
      icon: '🏠',
      tag: 'Smart Robotics, IoT Lighting & Air Care',
      bgImg:
        'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    };
  }
  if (
    s.includes('power') ||
    s.includes('charger') ||
    s.includes('cable') ||
    s.includes('battery')
  ) {
    return {
      icon: '⚡',
      tag: 'Fast GaN Bricks, MagSafe & Power Banks',
      bgImg:
        'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
      iconBg: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    };
  }
  return {
    icon: '🛍️',
    tag: 'Curated Department & Premium Essentials',
    bgImg:
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80',
    iconBg: 'bg-primary/20 text-primary border border-primary/30',
  };
}

export function SiteNav({
  items = [],
  categories = [],
  lang,
  label,
  categoriesLabel = 'Categories',
  allProductsLabel = 'All Products',
  trackLabel = 'Track Order',
}) {
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

  const hasCategoriesItem = cleanedItems.some(
    (i) => i.id === 'categories' || i.label?.toLowerCase() === 'categories',
  );
  const hasOffersItem =
    hasItemWithHref('/search?sort=price_asc') || cleanedItems.some((i) => i.id === 'offers');
  const hasTrackItem = hasItemWithHref('/track') || cleanedItems.some((i) => i.id === 'track');

  // Curated fallback categories if shop categories list is empty
  const displayCategories =
    categories.length > 0
      ? categories
      : [
          { id: 'mobiles', name: 'Smartphones & Mobiles', slug: 'mobiles' },
          { id: 'audio', name: 'Audio & Wireless Wearables', slug: 'audio' },
          { id: 'computing', name: 'Computing & Gaming Gear', slug: 'computing' },
          { id: 'fashion', name: 'Fashion & Streetwear Apparel', slug: 'fashion' },
          { id: 'home', name: 'Smart Living & Robotics', slug: 'smart-home' },
          { id: 'power', name: 'Power, GaN Chargers & Cables', slug: 'power-cables' },
        ];

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
              <div className="invisible absolute start-0 top-full z-50 min-w-56 rounded-2xl border bg-background p-3 opacity-0 shadow-xl transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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

        {/* Categories Mega Dropdown with Background Images and Big Icons */}
        {!hasCategoriesItem && (
          <li className="group relative">
            <button
              type="button"
              className={`${topLinkStyle} group-hover:text-foreground cursor-pointer`}
              aria-haspopup="true"
            >
              <span aria-hidden="true">📑</span>
              <span className="font-semibold">{categoriesLabel}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 transition-transform group-hover:rotate-180"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Visual Mega Dropdown Panel */}
            <div className="invisible absolute start-0 top-full z-50 w-[780px] max-w-[94vw] lg:w-[860px] rounded-3xl border border-border/80 bg-background/95 p-6 opacity-0 shadow-2xl backdrop-blur-2xl transition-all duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Curated Store Departments
                  </span>
                </div>
                <Link
                  href={localizePath('/search', lang)}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>{allProductsLabel}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              {/* Grid of Visual Category Cards with Background Images & Big Icons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
                {displayCategories.map((c) => {
                  const visual = getCategoryVisual(c.name, c.slug);
                  const bgImage = c.image?.url || visual.bgImg;

                  return (
                    <Link
                      key={c.id || c.slug}
                      href={localizePath(categoryPath(c.slug), lang)}
                      className="group/card relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 p-4 shadow-xs transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 hover:shadow-lg"
                    >
                      {/* Background Image Layer with Dark Gradient Overlay */}
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover/card:scale-110"
                        style={{ backgroundImage: `url(${bgImage})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/85 to-slate-900/70" />

                      {/* Big Size Icon Container */}
                      <div
                        className={`relative z-10 flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl text-3xl sm:text-4xl shadow-md backdrop-blur-md transition-transform duration-300 group-hover/card:scale-110 ${visual.iconBg}`}
                      >
                        {c.icon || visual.icon}
                      </div>

                      {/* Category Content */}
                      <div className="relative z-10 grid gap-1 text-start min-w-0">
                        <span className="text-sm sm:text-base font-bold text-white transition-colors group-hover/card:text-amber-300 truncate">
                          {c.name}
                        </span>
                        <span className="text-xs text-slate-300 line-clamp-1">
                          {c.tag || visual.tag}
                        </span>
                      </div>

                      {/* Action Arrow */}
                      <span
                        aria-hidden="true"
                        className="relative z-10 ms-auto flex size-8 items-center justify-center rounded-full bg-white/10 text-white opacity-0 transition-all duration-300 group-hover/card:opacity-100 group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1"
                      >
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Bottom Quick Bar */}
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="text-emerald-500 font-bold">✓</span> Fast Kingdom-Wide Dispatch
                </span>
                <Link
                  href={`${localizePath('/search', lang)}?sort=price_asc`}
                  className="font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                >
                  <span aria-hidden="true">🔥</span>
                  <span>Shop Super Deals</span>
                </Link>
              </div>
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
              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-3.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-2xs"
            >
              <span aria-hidden="true">📦</span>
              <span>{trackLabel}</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
