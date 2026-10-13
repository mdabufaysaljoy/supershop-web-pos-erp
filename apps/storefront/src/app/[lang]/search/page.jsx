import { redirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ListingView } from '@/components/catalog/ListingView';
import { localizePath } from '@/i18n/config';
import { searchProducts } from '@/lib/catalog';
import { hasEmptyParams, listingHref, parseListing, toSearchQuery } from '@/lib/listing';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/** Search results and "all products" (no query). Not indexed: results pages aren't content. */
export async function generateMetadata({ params, searchParams }) {
  const { lang } = await params;
  const { q } = parseListing(await searchParams);
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/search',
    title: q ? t('catalog.searchTitle', { q }) : t('catalog.allProducts'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function SearchPage({ params, searchParams }) {
  const { lang } = await params;
  const raw = await searchParams;
  const listing = parseListing(raw);
  if (hasEmptyParams(raw)) redirect(listingHref(localizePath('/search', lang), listing));
  const { t, fmt } = await getPageContext(lang);
  const result = await searchProducts(lang, toSearchQuery(listing));
  const title = listing.q ? t('catalog.searchTitle', { q: listing.q }) : t('catalog.allProducts');
  return (
    <ListingView
      path={localizePath('/search', lang)}
      listing={listing}
      result={result}
      lang={lang}
      t={t}
      fmt={fmt}
      categoryFacet
      header={
        <header className="grid gap-3">
          <Breadcrumbs
            items={[
              { name: t('nav.home'), path: '/' },
              { name: title, path: '/search' },
            ]}
            lang={lang}
            label={t('catalog.breadcrumbs')}
          />
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </header>
      }
    />
  );
}
