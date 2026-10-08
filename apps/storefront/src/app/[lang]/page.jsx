import { getDictionary, translator } from '@/i18n/dictionaries';
import { getPublicSettings } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';

/** Home placeholder. The page-builder-driven home page arrives with P5.6 (catalog pages in P3.1). */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const [settings, dict] = await Promise.all([getPublicSettings(), getDictionary(lang)]);
  const t = translator(dict);
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
  const [settings, dict] = await Promise.all([getPublicSettings(), getDictionary(lang)]);
  const t = translator(dict);
  return (
    <section className="grid max-w-2xl gap-3 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t('home.title', { store: settings['store.name'] })}
      </h1>
      <p className="text-muted-foreground">{t('home.intro')}</p>
    </section>
  );
}
