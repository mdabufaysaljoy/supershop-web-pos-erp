import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '@supershop/ui';
import { notFound } from 'next/navigation';
import { localizePath } from '@/i18n/config';
import { apiGet } from '@/lib/api';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/**
 * A page built in the admin (P5.1). Server-rendered like every other page, with the SAME renderer
 * the admin preview uses — what an editor approves is what a visitor and Google get.
 */
export const revalidate = 60;

async function fetchPage(slug, lang) {
  try {
    return (
      await apiGet(`/api/v1/pages/public/${encodeURIComponent(slug)}`, {
        lang,
        tags: ['pages', `page:${slug}`],
      })
    ).data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { lang, slug } = await params;
  const [{ settings }, page] = await Promise.all([getPageContext(lang), fetchPage(slug, lang)]);
  if (!page) return buildMetadata({ lang, path: `/p/${slug}`, title: '', noindex: true });
  return buildMetadata({
    lang,
    path: `/p/${page.slug}`,
    title: page.seo?.title || page.title,
    description: page.seo?.description,
    siteName: settings['store.name'],
  });
}

export default async function CmsPage({ params }) {
  const { lang, slug } = await params;
  const [{ t, fmt }, page] = await Promise.all([getPageContext(lang), fetchPage(slug, lang)]);
  if (!page) notFound();

  return (
    <article className="mx-auto grid w-full max-w-5xl gap-10">
      <BlockRenderer
        blocks={page.content.blocks}
        components={ALL_BLOCK_COMPONENTS}
        context={{
          lang,
          media: page.media ?? {},
          /** Products, categories and brands the API resolved for the data-backed blocks (P5.3). */
          data: page.data ?? {},
          formatMoney: fmt.money,
          formatNumber: fmt.number,
          /** The few strings a block renders itself; the package holds no translations. */
          labels: {
            previous: t('blocks.previousSlide'),
            next: t('blocks.nextSlide'),
            slide: t('blocks.slide'),
            days: t('blocks.days'),
            hours: t('blocks.hours'),
            minutes: t('blocks.minutes'),
            seconds: t('blocks.seconds'),
          },
          emailLabel: t('blocks.emailAddress'),
          /** Internal links keep the visitor in their language; external ones are left alone. */
          localizeHref: (href) => (href?.startsWith('/') ? localizePath(href, lang) : href),
        }}
      />
    </article>
  );
}
