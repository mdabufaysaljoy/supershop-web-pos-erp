import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductGrid } from '@/components/catalog/ProductCard';
import { JsonLd } from '@/components/JsonLd';
import { ProductView } from '@/components/product/ProductView';
import { categoryPath, primaryTrail, productPath } from '@/lib/categories';
import { getCategoryTree, getProduct, searchProducts } from '@/lib/catalog';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbLd, productLd } from '@/lib/structuredData';

/** Custom attribute value as display text (booleans, numbers and dates localized). */
function attributeText(a, t, fmt) {
  if (a.type === 'boolean') return t(a.value ? 'catalog.yes' : 'catalog.no');
  if (a.type === 'number') return fmt.number(a.value);
  if (a.type === 'date') return fmt.date(a.value);
  return Array.isArray(a.value) ? a.value.join(', ') : String(a.value);
}

export const dynamicParams = true; // rendered on first visit, then cached (ISR)
export const revalidate = 60;
/** No build-time list: products are rendered on demand and cached (ISR). */
export const generateStaticParams = async () => [];

async function load(lang, slug) {
  const product = await getProduct(lang, slug);
  if (!product) notFound();
  return product;
}

export async function generateMetadata({ params }) {
  const { lang, slug } = await params;
  const p = await load(lang, slug);
  const { settings } = await getPageContext(lang);
  const main = p.images[0];
  return buildMetadata({
    lang,
    path: productPath(slug),
    title: p.seo?.title || p.name,
    description: (p.seo?.description || p.shortDescription || p.description || p.name).slice(
      0,
      300,
    ),
    siteName: settings['store.name'],
    images: main
      ? [{ url: main.url, width: main.width, height: main.height, alt: p.name }]
      : undefined,
  });
}

export default async function ProductPage({ params }) {
  const { lang, slug } = await params;
  const product = await load(lang, slug);
  const [{ settings, t, fmt, fmtOptions }, tree] = await Promise.all([
    getPageContext(lang),
    getCategoryTree(lang),
  ]);
  const trail = primaryTrail(tree, product.categoryIds);
  const crumbs = [
    { name: t('nav.home'), path: '/' },
    ...trail.map((c) => ({ name: c.name, path: categoryPath(c.slug) })),
    { name: product.name, path: productPath(slug) },
  ];
  const leaf = trail.at(-1);
  const related = leaf
    ? (
        await searchProducts(lang, { categoryId: leaf.id, limit: 9, sort: 'newest' }).catch(() => ({
          data: [],
        }))
      ).data
        .filter((p) => p.id !== product.id)
        .slice(0, 8)
    : [];

  return (
    <div className="grid gap-10">
      <Breadcrumbs items={crumbs} lang={lang} label={t('catalog.breadcrumbs')} />
      <ProductView
        product={product}
        fmtOptions={fmtOptions}
        pricesIncludeVat={settings['tax.pricesIncludeVat']}
      />

      {(product.description || product.attributes?.length > 0) && (
        <section className="grid gap-6 md:grid-cols-[2fr_1fr]" aria-label={t('catalog.details')}>
          {product.description && (
            <div className="grid content-start gap-2">
              <h2 className="text-lg font-semibold">{t('catalog.description')}</h2>
              <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
            </div>
          )}
          {product.attributes?.length > 0 && (
            <div className="grid content-start gap-2">
              <h2 className="text-lg font-semibold">{t('catalog.specifications')}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {product.attributes.map((a) => (
                  <div key={a.key} className="contents">
                    <dt className="text-muted-foreground">{a.label}</dt>
                    <dd>{attributeText(a, t, fmt)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="grid gap-4" aria-labelledby="related">
          <h2 id="related" className="text-lg font-semibold">
            {t('catalog.related')}
          </h2>
          <ProductGrid products={related} lang={lang} fmt={fmt} t={t} eager={0} />
        </section>
      )}
      <JsonLd
        data={productLd({
          product,
          path: productPath(slug),
          lang,
          currency: settings['store.currency'],
        })}
      />
      <JsonLd data={breadcrumbLd(crumbs, lang)} />
    </div>
  );
}
