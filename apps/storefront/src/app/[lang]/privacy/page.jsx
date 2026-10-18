import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  const storeName = settings['store.name'] || 'Supershop';
  return buildMetadata({
    lang,
    path: '/privacy',
    title: t('consent.privacyPolicy') || 'Privacy Policy',
    description: `Privacy Policy and data protection practices for ${storeName} under the Saudi Personal Data Protection Law (PDPL).`,
    siteName: storeName,
  });
}

export default async function PrivacyPage({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  const storeName = settings['store.name'] || 'Supershop';

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-10 text-center sm:text-start border-b border-border/80 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-3">
          <span>🛡️ Saudi PDPL Compliant</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {t('consent.privacyPolicy') || 'Privacy Policy'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last revised: October 2026 · Applicable to all customers and visitors of {storeName}.
        </p>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-foreground/90">
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            1. Introduction & Regulatory Framework
          </h2>
          <p className="mt-2 text-muted-foreground">
            {storeName} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
            safeguarding your privacy and personal data. This Privacy Policy sets out how we
            collect, process, store, and protect your information when you visit our storefront,
            purchase goods, or communicate with us, in strict compliance with the{' '}
            <strong className="text-foreground">Saudi Personal Data Protection Law (PDPL)</strong>{' '}
            enacted by Royal Decree No. (M/19) and regulated by the Saudi Data and AI Authority
            (SDAIA).
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">2. Personal Data We Collect</h2>
          <p className="mt-2 text-muted-foreground">
            We collect only data necessary to process your transactions and improve your experience:
          </p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Contact & Identification:</strong> Your full name,
              mobile phone number, and email address.
            </li>
            <li>
              <strong className="text-foreground">Shipping & Address Data:</strong> Delivery
              location, city, district, street address, and National Address (Saudi Post / SPL).
            </li>
            <li>
              <strong className="text-foreground">Order & Transaction Records:</strong> Purchased
              products, payment confirmation status, and billing invoice details. Card data is
              securely processed via certified Saudi payment gateways (e.g. Mada, Apple Pay, Visa,
              Tabby, Tamara) and never stored in plain text on our servers.
            </li>
            <li>
              <strong className="text-foreground">Technical & Device Telemetry:</strong> IP address,
              device type, browser metadata, and consent preferences.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            3. Purpose and Legal Basis for Processing
          </h2>
          <p className="mt-2 text-muted-foreground">
            We process your data strictly under the following lawful bases:
          </p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Contractual Performance:</strong> Processing
              checkout orders, dispatching shipments with local courier partners, and processing
              refunds or exchanges.
            </li>
            <li>
              <strong className="text-foreground">Legal Obligations:</strong> Compliance with ZATCA
              electronic tax invoicing (15% VAT), commercial law regulations, and anti-fraud
              mandates.
            </li>
            <li>
              <strong className="text-foreground">Explicit Consent:</strong> Personalization of
              promotions, analytical metrics, and marketing cookies. You retain the right to
              withdraw consent at any time.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            4. Cookies and Tracking Technologies
          </h2>
          <p className="mt-2 text-muted-foreground">
            We utilize first-party and third-party cookies to provide security, measure storefront
            traffic, and tailor promotional campaigns:
          </p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Strictly Necessary Cookies:</strong> Required for
              shopping cart persistence, authentication, and secure checkout navigation.
            </li>
            <li>
              <strong className="text-foreground">Analytics Cookies:</strong> Help us measure
              aggregate site activity and popular category rails (e.g. Google Analytics 4).
            </li>
            <li>
              <strong className="text-foreground">Marketing & Pixel Trackers:</strong> Activated
              only upon your explicit consent via our cookie banner to serve relevant offers on
              Meta, TikTok, Google, or Snapchat.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            5. Your Legal Rights Under Saudi PDPL
          </h2>
          <p className="mt-2 text-muted-foreground">
            As a data subject in Saudi Arabia, you have enforceable legal rights including:
          </p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Right to Know:</strong> Understand what data we
              collect, why, and who receives it.
            </li>
            <li>
              <strong className="text-foreground">Right of Access:</strong> Request a copy of your
              personal data maintained by {storeName}.
            </li>
            <li>
              <strong className="text-foreground">Right to Rectification:</strong> Request
              correction or update of any inaccurate records.
            </li>
            <li>
              <strong className="text-foreground">Right to Erasure:</strong> Request destruction of
              your personal data when no longer legally required for tax or fraud audit purposes.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">6. Contact Data Protection Officer</h2>
          <p className="mt-2 text-muted-foreground">
            For questions, data access requests, or privacy inquiries, contact our customer privacy
            desk through our official support channels or email us at support@
            {storeName.toLowerCase().replace(/[^a-z0-9]/g, '')}.sa.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={localizePath('/', lang)}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-xs font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              Back to Storefront
            </Link>
            <Link
              href={localizePath('/terms', lang)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Terms of Service
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
