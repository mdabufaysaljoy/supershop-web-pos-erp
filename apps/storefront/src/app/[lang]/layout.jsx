import { createFormatters } from '@supershop/shared';
import { notFound } from 'next/navigation';
import { arabicFont, latinFont } from '@/fonts';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { JsonLd } from '@/components/JsonLd';
import { dirOf, isLocale, LOCALES } from '@/i18n/config';
import { getDictionary, translator } from '@/i18n/dictionaries';
import { AuthProvider } from '@/components/account/AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { CartProvider } from '@/components/cart/CartProvider';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { formatOptions } from '@/lib/catalog';
import { pickNamespaces } from '@/i18n/translate';
import { getPublicSettings, getPublicTracking } from '@/lib/api';
import { TrackingProvider } from '@/components/tracking/TrackingProvider';
import { getCategoryTree } from '@/lib/catalog';
import { getSiteChrome } from '@/lib/chrome';
import { absoluteUrl, SITE_URL } from '@/lib/site';
import { organizationLd, websiteLd } from '@/lib/structuredData';
import '../globals.css';

/**
 * Root layout per language: `<html lang dir>` is rendered on the SERVER, so Arabic pages are RTL
 * from the first byte (no flash, correct for crawlers).
 */
// Unknown languages 404 via notFound() below. (Not `dynamicParams = false`: that would also stop
// on-demand ISR of child pages such as products.)
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const [settings, chrome] = await Promise.all([getPublicSettings(), getSiteChrome(lang)]);
  const t = translator(await getDictionary(lang));
  const name = settings['store.name'];
  // The shop's own suffix wins over the store name; its description over the built-in tagline.
  const suffix = chrome.seo.titleSuffix || name;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: suffix, template: `%s · ${suffix}` },
    description: chrome.seo.defaultDescription || t('site.tagline'),
    applicationName: name,
    icons: { icon: chrome.brand.favicon?.url ?? '/favicon.svg' },
    ...(chrome.brand.ogImage && { openGraph: { images: [{ url: chrome.brand.ogImage.url }] } }),
    // A shop that has not opened yet (or a copy of one) stays out of the index entirely.
    ...(chrome.seo.indexable ? {} : { robots: { index: false, follow: false } }),
    formatDetection: { telephone: false }, // phone numbers render via our own components
  };
}

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function LangLayout({ children, params }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [settings, dict, categories, chrome, tracking] = await Promise.all([
    getPublicSettings(),
    getDictionary(lang),
    getCategoryTree(lang),
    getSiteChrome(lang),
    getPublicTracking(),
  ]);
  const t = translator(dict);
  const storeName = settings['store.name'];
  const fmtOptions = formatOptions(lang, settings);
  const fmt = createFormatters(fmtOptions);

  // `style={chrome.theme}`: the shop's theme tokens (P5.4) override the stylesheet's defaults
  // server-side, so the very first paint already has its colours.
  //
  // suppressHydrationWarning: browser extensions add attributes to <html>/<body> before React
  // hydrates (password managers, launchers, Grammarly…), which React reports as a hydration
  // mismatch. It only silences attribute mismatches on these two elements — anything the app
  // itself renders differently on server and client is still reported.
  return (
    <html
      lang={lang}
      dir={dirOf(lang)}
      className={`${latinFont.variable} ${arabicFont.variable}`}
      style={chrome.theme}
      suppressHydrationWarning
    >
      <body className="flex min-h-svh flex-col font-sans" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {t('site.skipToContent')}
        </a>
        <I18nProvider lang={lang} dict={pickNamespaces(dict)}>
          <TrackingProvider initialData={tracking}>
            <MotionProvider>
              <CartProvider fmtOptions={fmtOptions}>
                <AuthProvider>
                  <AnnouncementBar announcement={chrome.announcement} lang={lang} />
                  <SiteHeader
                    lang={lang}
                    storeName={storeName}
                    logo={chrome.brand.logo}
                    logoDisplay={chrome.brand.logoDisplay ?? 'both'}
                    categories={categories}
                    header={chrome.header}
                    t={t}
                  />
                  <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
                    {children}
                  </main>
                  <SiteFooter
                    lang={lang}
                    storeName={storeName}
                    pricesIncludeVat={settings['tax.pricesIncludeVat']}
                    footer={chrome.footer}
                    contact={chrome.contact}
                    social={chrome.social}
                    seoDescription={chrome.seo.defaultDescription}
                    categories={categories}
                    t={t}
                    fmt={fmt}
                  />
                </AuthProvider>
              </CartProvider>
            </MotionProvider>
          </TrackingProvider>
        </I18nProvider>
        <JsonLd
          data={organizationLd({
            name: storeName,
            logoUrl: chrome.brand.logo?.url ? absoluteUrl(chrome.brand.logo.url) : undefined,
            sameAs: Object.values(chrome.social ?? {}).filter(Boolean),
          })}
        />
        <JsonLd data={websiteLd({ name: storeName, lang })} />
      </body>
    </html>
  );
}
