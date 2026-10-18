import { notFound, redirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ListingView } from '@/components/catalog/ListingView';
import { JsonLd } from '@/components/JsonLd';
import { localizePath } from '@/i18n/config';
import { categoryPath, findCategory, productPath } from '@/lib/categories';
import { getCategoryTree, searchProducts } from '@/lib/catalog';
import { hasEmptyParams, isRefined, listingHref, parseListing, toSearchQuery } from '@/lib/listing';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbLd, itemListLd } from '@/lib/structuredData';

export const dynamicParams = true; // any category slug; unknown ones 404

async function load(lang, slug) {
  const found = findCategory(await getCategoryTree(lang), { slug });
  if (!found) notFound();
  return found;
}

export async function generateMetadata({ params, searchParams }) {
  const { lang, slug } = await params;
  const listing = parseListing(await searchParams);
  const { node } = await load(lang, slug);
  const { settings, t } = await getPageContext(lang);
  const pageSuffix = listing.page > 1 ? ` · ${t('catalog.pageN', { page: listing.page })}` : '';
  return buildMetadata({
    lang,
    // Filtered/sorted variants point to the plain category (no duplicate content); pages 2+ keep
    // their own canonical so every product stays reachable.
    path:
      categoryPath(slug) + (!isRefined(listing) && listing.page > 1 ? `?page=${listing.page}` : ''),
    title: (node.seo?.title || node.name) + pageSuffix,
    description:
      node.seo?.description ||
      node.description ||
      t('catalog.categoryDescription', { name: node.name, store: settings['store.name'] }),
    siteName: settings['store.name'],
    images: node.image
      ? [
          {
            url: node.image.url,
            width: node.image.width,
            height: node.image.height,
            alt: node.name,
          },
        ]
      : undefined,
    noindex: isRefined(listing),
  });
}

export default async function CategoryPage({ params, searchParams }) {
  const { lang, slug } = await params;
  const raw = await searchParams;
  const listing = parseListing(raw);
  if (hasEmptyParams(raw)) redirect(listingHref(localizePath(categoryPath(slug), lang), listing));
  const { node, trail } = await load(lang, slug);
  const { t, fmt } = await getPageContext(lang);
  const result = await searchProducts(
    lang,
    toSearchQuery({ ...listing, category: null }, { categoryId: node.id }),
  );
  const crumbs = [
    { name: t('nav.home'), path: '/' },
    ...trail.map((c) => ({ name: c.name, path: categoryPath(c.slug) })),
  ];

  return (
    <>
      <ListingView
        path={localizePath(categoryPath(slug), lang)}
        listing={{ ...listing, category: null }}
        result={result}
        lang={lang}
        t={t}
        fmt={fmt}
        subcategories={node.children ?? []}
        header={
          <header className="grid gap-3">
            <Breadcrumbs items={crumbs} lang={lang} label={t('catalog.breadcrumbs')} />
            <h1 className="text-3xl font-semibold tracking-tight">{node.name}</h1>
            {node.description && (
              <p className="max-w-3xl whitespace-pre-line text-muted-foreground">
                {node.description}
              </p>
            )}
          </header>
        }
      />
      <JsonLd data={breadcrumbLd(crumbs, lang)} />
      {result.data?.length > 0 && (
        <JsonLd
          data={itemListLd({
            name: node.name,
            items: result.data.map((p) => ({
              name: p.name,
              path: productPath(p.slug),
              image: p.image?.url,
            })),
            lang,
          })}
        />
      )}
    </>
  );
}
