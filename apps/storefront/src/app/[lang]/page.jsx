import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '@supershop/ui';
import Link from 'next/link';
import { MediaImage } from '@/components/catalog/MediaImage';
import { ProductGrid } from '@/components/catalog/ProductCard';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';
import { getCategoryTree, searchProducts } from '@/lib/catalog';
import { blockContext, getHomePage } from '@/lib/cmsPage';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/**
 * Home. The shop arranges it in the builder (seeded with a starting template, P5.6), and this
 * route renders those blocks — the same renderer every other page uses.
 *
 * The built-in layout below is the fallback for a shop that has no home page at all (it deleted
 * it, or the seed never ran): a storefront is never left without a front door.
 */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const [{ settings, t }, page] = await Promise.all([getPageContext(lang), getHomePage(lang)]);
  const store = settings['store.name'];
  return buildMetadata({
    lang,
    path: '/',
    // The shop's own title wins; without one the home page keeps its welcoming default.
    title: { absolute: page?.seo?.title || t('home.title', { store }) },
    description: page?.seo?.description || t('site.tagline'),
    siteName: store,
  });
}

export default async function HomePage({ params }) {
  const { lang } = await params;
  const [{ t, fmtOptions }, page] = await Promise.all([getPageContext(lang), getHomePage(lang)]);
  if (page)
    return (
      <div className="grid gap-14">
        <BlockRenderer
          blocks={page.content.blocks}
          components={ALL_BLOCK_COMPONENTS}
          context={blockContext({ page, lang, t, fmtOptions })}
        />
      </div>
    );
  const [{ settings }, categories, newest] = await Promise.all([
    getPageContext(lang),
    getCategoryTree(lang),
    searchProducts(lang, { sort: 'newest', limit: 8 }).catch(() => ({ data: [] })),
  ]);
  return (
    <BuiltInHome
      lang={lang}
      storeName={settings['store.name']}
      categories={categories}
      newest={newest.data}
      t={t}
    />
  );
}

/** The storefront's own home, for a shop without a home page of its own. */
function BuiltInHome({ lang, storeName, categories, newest, t }) {
  return (
    <div className="grid gap-14">
      <section className="grid gap-4 rounded-2xl bg-muted px-6 py-12 sm:px-10 sm:py-16">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('home.title', { store: storeName })}
        </h1>
        <p className="max-w-xl text-muted-foreground">{t('site.tagline')}</p>
        <p>
          <Link
            href={localizePath('/search', lang)}
            className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            {t('home.shopAll')}
          </Link>
        </p>
      </section>

      {categories.length > 0 && (
        <section className="grid gap-4" aria-labelledby="home-categories">
          <h2 id="home-categories" className="text-xl font-semibold">
            {t('home.categories')}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={localizePath(categoryPath(c.slug), lang)} className="group grid gap-2">
                  <span className="block aspect-square overflow-hidden rounded-xl bg-muted">
                    <MediaImage
                      image={c.image}
                      alt=""
                      sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 46vw"
                      className="size-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none"
                    />
                  </span>
                  <span className="text-sm font-medium">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {newest.length > 0 && (
        <section className="grid gap-4" aria-labelledby="home-new">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="home-new" className="text-xl font-semibold">
              {t('home.newArrivals')}
            </h2>
            <Link
              href={`${localizePath('/search', lang)}?sort=newest`}
              className="text-sm underline underline-offset-4"
            >
              {t('home.viewAll')}
            </Link>
          </div>
          <ProductGrid products={newest} eager={0} />
        </section>
      )}
    </div>
  );
}
