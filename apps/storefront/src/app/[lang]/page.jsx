import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '@supershop/ui';
import Link from 'next/link';
import { ProductGrid } from '@/components/catalog/ProductCard';
import { CategoryShowcase } from '@/components/home/CategoryShowcase';
import { HomeHero } from '@/components/home/HomeHero';
import { NewsletterSection } from '@/components/home/NewsletterSection';
import { PromoBanners } from '@/components/home/PromoBanners';
import { TestimonialWall } from '@/components/home/TestimonialWall';
import { TrustFeatures } from '@/components/home/TrustFeatures';
import { localizePath } from '@/i18n/config';
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
      <div className="grid gap-16 sm:gap-20">
        <BlockRenderer
          blocks={page.content.blocks}
          components={ALL_BLOCK_COMPONENTS}
          context={blockContext({ page, lang, t, fmtOptions })}
        />
        {/* Flagship interactive supershop additions */}
        <PromoBanners lang={lang} />
        <TestimonialWall />
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

/** The flagship supershop storefront experience */
function BuiltInHome({ lang, storeName, categories, newest, t }) {
  return (
    <div className="grid gap-16 sm:gap-20">
      {/* 1. Modern Flagship Hero Showcase */}
      <HomeHero lang={lang} storeName={storeName} />

      {/* 2. Trust Badges & Value Propositions */}
      <TrustFeatures />

      {/* 3. Multi-Category Department Grid */}
      <CategoryShowcase categories={categories} lang={lang} t={t} />

      {/* 4. Dual Promotional Category Spotlights (Electronics & Fashion) */}
      <PromoBanners lang={lang} />

      {/* 6. Trending & New Arrivals Product Showcase */}
      {newest.length > 0 && (
        <section className="grid gap-6" aria-labelledby="home-new">
          <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Fresh Stock Drops
              </span>
              <h2
                id="home-new"
                className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                {t('home.newArrivals')}
              </h2>
            </div>
            <Link
              href={`${localizePath('/search', lang)}?sort=newest`}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <span>{t('home.viewAll')}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 rtl:-scale-x-100 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <ProductGrid products={newest} eager={0} />
        </section>
      )}

      {/* 7. Customer Reviews & Community Trust Wall */}
      <TestimonialWall />

      {/* 8. VIP Club / Newsletter Subscription Banner */}
      <NewsletterSection />
    </div>
  );
}
