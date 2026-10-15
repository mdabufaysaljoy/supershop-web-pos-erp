import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '@supershop/ui';
import { notFound } from 'next/navigation';
import { blockContext, getCmsPage } from '@/lib/cmsPage';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/**
 * A page built in the admin (P5.1). Server-rendered like every other page, with the SAME renderer
 * the admin preview uses — what an editor approves is what a visitor and Google get.
 */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { lang, slug } = await params;
  const [{ settings }, page] = await Promise.all([getPageContext(lang), getCmsPage(slug, lang)]);
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
  const [{ t, fmtOptions }, page] = await Promise.all([
    getPageContext(lang),
    getCmsPage(slug, lang),
  ]);
  if (!page) notFound();

  return (
    <article className="mx-auto grid w-full max-w-5xl gap-10">
      <BlockRenderer
        blocks={page.content.blocks}
        components={ALL_BLOCK_COMPONENTS}
        context={blockContext({ page, lang, t, fmtOptions })}
      />
    </article>
  );
}
