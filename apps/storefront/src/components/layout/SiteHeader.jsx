import Link from 'next/link';
import { AccountButton } from '@/components/account/AccountButton';
import { CartButton } from '@/components/cart/CartButton';
import { MediaImage } from '@/components/catalog/MediaImage';
import { SearchBox } from '@/components/search/SearchBox';
import { languageOptions, localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SiteNav } from './SiteNav';

/**
 * Site header: logo, search with suggestions, language switch, cart, and the navigation — the
 * menu the shop arranged if it made one (P5.4), otherwise its top-level categories. Logical
 * spacing only (RTL-safe); the category row scrolls sideways on phones.
 */
export function SiteHeader({
  lang,
  storeName,
  logo = null,
  logoDisplay = 'both',
  categories = [],
  header = {},
  t,
}) {
  // Ensure very top navigation option is Home (D-Storefront top nav fix)
  const menuItems = (header.menu ?? []).map((item, idx) => {
    if (idx === 0 && (item.id === 'all' || item.href === '/search')) {
      return { ...item, id: 'home', label: t('nav.home'), href: '/' };
    }
    return item;
  });

  const showLogo = Boolean(logo && logoDisplay !== 'name');
  const showIcon = !showLogo;
  const showName = logoDisplay !== 'logo' || !logo;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 shadow-xs backdrop-blur-md transition-all">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[auto_minmax(0,36rem)_1fr_auto]">
        <Link
          href={localizePath('/', lang)}
          className="group flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground transition-transform hover:opacity-95"
          aria-label={storeName}
        >
          {showLogo && (
            <MediaImage
              image={logo}
              alt={storeName}
              sizes="180px"
              priority
              className="h-9 w-auto object-contain"
            />
          )}
          {showIcon && (
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-blue-600 text-primary-foreground shadow-sm shadow-primary/25 transition-transform group-hover:scale-105">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                <path d="M2 7h20" />
              </svg>
            </span>
          )}
          {showName && (
            <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-xl">
              {storeName}
            </span>
          )}
        </Link>
        <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
          <SearchBox />
        </div>
        <div className="col-start-3 row-start-1 flex items-center justify-end gap-1.5 md:col-start-4">
          <LanguageSwitcher lang={lang} languages={languageOptions()} label={t('nav.language')} />
          <AccountButton />
          <CartButton />
        </div>
      </div>
      <SiteNav
        items={menuItems}
        categories={categories}
        lang={lang}
        label={t('nav.primary')}
        categoriesLabel={t('catalog.categories')}
        allProductsLabel={t('nav.allProducts')}
        trackLabel={t('track.linkLabel')}
      />
      {header.showCategoryRow === false ? null : (
        <nav aria-label={t('nav.primary')} className="border-t border-border/50 bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-1.5">
            <ul className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto text-xs whitespace-nowrap sm:text-sm">
              <li>
                <Link
                  href={localizePath('/search', lang)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3.5 py-1.5 font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
                >
                  <span aria-hidden="true">⚡</span>
                  {t('nav.allProducts')}
                </Link>
              </li>
              {categories.length > 0 ? (
                categories.slice(0, 10).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={localizePath(categoryPath(c.slug), lang)}
                      className="inline-flex items-center rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))
              ) : (
                <>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=mobile`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">📱</span>
                      Mobiles & Gadgets
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=audio`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">🎧</span>
                      Audio & Sound
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=laptop`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">💻</span>
                      Computing & Tech
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=clothing`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">👕</span>
                      Fashion & Apparel
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=home`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">🏠</span>
                      Smart Home
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`${localizePath('/search', lang)}?q=power`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden="true">⚡</span>
                      Power & Charging
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>
      )}
    </header>
  );
}
