import Link from 'next/link';
import { AccountButton } from '@/components/account/AccountButton';
import { CartButton } from '@/components/cart/CartButton';
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
export function SiteHeader({ lang, storeName, categories = [], header = {}, t }) {
  return (
    <header className="border-b">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-[auto_minmax(0,36rem)_1fr_auto]">
        <Link href={localizePath('/', lang)} className="text-lg font-semibold">
          {storeName}
        </Link>
        <div className="col-span-3 row-start-2 md:col-span-1 md:row-start-1 md:col-start-2">
          <SearchBox />
        </div>
        <div className="col-start-3 row-start-1 flex items-center justify-end gap-2 md:col-start-4">
          <LanguageSwitcher lang={lang} languages={languageOptions()} label={t('nav.language')} />
          <AccountButton />
          <CartButton />
        </div>
      </div>
      {header.menu?.length ? (
        <SiteNav items={header.menu} lang={lang} label={t('nav.primary')} />
      ) : header.showCategoryRow === false ? null : (
        <nav aria-label={t('nav.primary')} className="mx-auto max-w-7xl px-4">
          <ul className="-mb-px flex gap-5 overflow-x-auto text-sm whitespace-nowrap">
            <li>
              <Link
                href={localizePath('/search', lang)}
                className="inline-block border-b-2 border-transparent py-2.5 font-medium hover:border-foreground"
              >
                {t('nav.allProducts')}
              </Link>
            </li>
            {categories.slice(0, 10).map((c) => (
              <li key={c.id}>
                <Link
                  href={localizePath(categoryPath(c.slug), lang)}
                  className="inline-block border-b-2 border-transparent py-2.5 text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
