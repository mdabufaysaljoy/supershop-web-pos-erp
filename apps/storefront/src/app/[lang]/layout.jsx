import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { JsonLd } from '@/components/JsonLd';
import { dirOf, isLocale, LOCALES } from '@/i18n/config';
import { getDictionary, translator } from '@/i18n/dictionaries';
import { getPublicSettings } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import { organizationLd, websiteLd } from '@/lib/structuredData';
import '../globals.css';

/**
 * Root layout per language: `<html lang dir>` is rendered on the SERVER, so Arabic pages are RTL
 * from the first byte (no flash, correct for crawlers).
 */
export const dynamicParams = false; // only known languages; anything else 404s
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const settings = await getPublicSettings();
  const t = translator(await getDictionary(lang));
  const name = settings['store.name'];
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s · ${name}` },
    description: t('site.tagline'),
    applicationName: name,
    icons: { icon: '/favicon.svg' },
    formatDetection: { telephone: false }, // phone numbers render via our own components
  };
}

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function LangLayout({ children, params }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [settings, dict] = await Promise.all([getPublicSettings(), getDictionary(lang)]);
  const t = translator(dict);
  const storeName = settings['store.name'];

  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body className="flex min-h-svh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {t('site.skipToContent')}
        </a>
        <SiteHeader lang={lang} storeName={storeName} t={t} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
          {children}
        </main>
        <SiteFooter
          storeName={storeName}
          pricesIncludeVat={settings['tax.pricesIncludeVat']}
          t={t}
        />
        <JsonLd data={organizationLd({ name: storeName })} />
        <JsonLd data={websiteLd({ name: storeName, lang })} />
      </body>
    </html>
  );
}
