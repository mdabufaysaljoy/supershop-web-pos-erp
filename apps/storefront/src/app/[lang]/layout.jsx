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
import { getPublicSettings } from '@/lib/api';
import { getCategoryTree } from '@/lib/catalog';
import { getSiteChrome } from '@/lib/chrome';
import { SITE_URL } from '@/lib/site';
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
  const [settings, dict, categories, chrome] = await Promise.all([
    getPublicSettings(),
    getDictionary(lang),
    getCategoryTree(lang),
    getSiteChrome(lang),
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
          <MotionProvider>
            <CartProvider fmtOptions={fmtOptions}>
              <AuthProvider>
                <AnnouncementBar announcement={chrome.announcement} lang={lang} />
                <SiteHeader
                  lang={lang}
                  storeName={storeName}
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
                  t={t}
                  fmt={fmt}
                />
              </AuthProvider>
            </CartProvider>
          </MotionProvider>
        </I18nProvider>
        <JsonLd data={organizationLd({ name: storeName })} />
        <JsonLd data={websiteLd({ name: storeName, lang })} />
      </body>
    </html>
  );
}
