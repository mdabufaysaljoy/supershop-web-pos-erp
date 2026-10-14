import { Suspense } from 'react';
import { TrackOrderView } from '@/components/track/TrackOrderView';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/**
 * "Track your order" — a public, indexable page people search for by name. Only the FORM is
 * rendered on the server; the order itself is fetched in the browser, so nothing personal is ever
 * cached or indexed.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/track',
    title: t('track.title'),
    description: t('track.description'),
    siteName: settings['store.name'],
  });
}

export default async function TrackPage({ params }) {
  const { lang } = await params;
  const { t } = await getPageContext(lang);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('track.title')}</h1>
        <p className="text-muted-foreground">{t('track.description')}</p>
      </div>
      <Suspense>
        <TrackOrderView />
      </Suspense>
    </div>
  );
}
