import Link from 'next/link';
import { MediaImage } from '@/components/catalog/MediaImage';
import { ProductGrid } from '@/components/catalog/ProductCard';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';
import { getCategoryTree, searchProducts } from '@/lib/catalog';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/**
 * Home: hero, shop-by-category and new arrivals. The page-builder home (sections admins arrange)
 * replaces this layout with P5.6; the data blocks stay the same.
 */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  const store = settings['store.name'];
  return buildMetadata({
    lang,
    path: '/',
    title: { absolute: t('home.title', { store }) },
    description: t('site.tagline'),
    siteName: store,
  });
}

export default async function HomePage({ params }) {
  const { lang } = await params;
  const [{ settings, t, fmt }, categories, newest] = await Promise.all([
    getPageContext(lang),
    getCategoryTree(lang),
    searchProducts(lang, { sort: 'newest', limit: 8 }).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-14">
      <section className="grid gap-4 rounded-2xl bg-muted px-6 py-12 sm:px-10 sm:py-16">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('home.title', { store: settings['store.name'] })}
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

      {newest.data.length > 0 && (
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
          <ProductGrid products={newest.data} lang={lang} fmt={fmt} t={t} eager={0} />
        </section>
      )}
    </div>
  );
}
