import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings } = await getPageContext(lang);
  const storeName = settings['store.name'] || 'Supershop';
  return buildMetadata({
    lang,
    path: '/terms',
    title: 'Terms and Conditions',
    description: `Terms and conditions of sale and customer agreement for ${storeName} under Saudi E-Commerce Law.`,
    siteName: storeName,
  });
}

export default async function TermsPage({ params }) {
  const { lang } = await params;
  const { settings } = await getPageContext(lang);
  const storeName = settings['store.name'] || 'Supershop';

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-10 text-center sm:text-start border-b border-border/80 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-3">
          <span>⚖️ Saudi Ministry of Commerce E-Commerce Law</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Terms & Conditions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Applicable to all orders, products, and services provided by {storeName} in the Kingdom of
          Saudi Arabia.
        </p>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-foreground/90">
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            1. Commercial Agreement & Applicability
          </h2>
          <p className="mt-2 text-muted-foreground">
            These Terms & Conditions constitute a legally binding agreement between you
            (&quot;Customer&quot;) and {storeName} (&quot;Store&quot;). By browsing our website,
            registering an account, or placing an order, you agree to these terms pursuant to the
            Saudi Electronic Commerce Law and Executive Regulations issued by the Ministry of
            Commerce.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">2. Pricing, Invoicing, and 15% VAT</h2>
          <p className="mt-2 text-muted-foreground">
            All prices displayed on {storeName} are in Saudi Riyals (SAR) and inclusive of the
            mandatory 15% Value Added Tax (VAT) administered by the Zakat, Tax and Customs Authority
            (ZATCA), unless explicitly stated otherwise. Each completed order receives a compliant
            electronic tax invoice delivered to the registered email and reachable via the order
            tracking page.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">3. Payment & BNPL Methods</h2>
          <p className="mt-2 text-muted-foreground">
            We provide official, secure payment processing certified by Saudi financial
            institutions:
          </p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Debit & Credit Cards:</strong> Mada, Visa,
              Mastercard, and Apple Pay.
            </li>
            <li>
              <strong className="text-foreground">Buy Now Pay Later:</strong> Tabby and Tamara
              interest-free installment options in accordance with Sharia-compliant financing
              guidelines.
            </li>
            <li>
              <strong className="text-foreground">Cash on Delivery (COD):</strong> Available for
              select regions with order verification.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">4. Shipping, Dispatch, & Delivery</h2>
          <p className="mt-2 text-muted-foreground">
            Orders are processed and dispatched through certified Saudi courier networks. Deliveries
            within major hubs (Riyadh, Jeddah, Dammam) typically arrive within 24 to 48 hours; all
            other Kingdom provinces within 2 to 4 business days. Real-time tracking is provided via
            our standalone{' '}
            <Link
              href={localizePath('/track', lang)}
              className="text-primary font-semibold underline"
            >
              Order Tracking
            </Link>{' '}
            tool.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">
            5. Returns, Exchanges, & Consumer Warranty
          </h2>
          <p className="mt-2 text-muted-foreground">Under Saudi Consumer Protection regulations:</p>
          <ul className="mt-3 list-disc ps-5 space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">14-Day Return Window:</strong> You may return
              unused products in original retail packaging within 14 days of delivery.
            </li>
            <li>
              <strong className="text-foreground">Defective Goods:</strong> If an item arrives
              damaged or inoperative, immediate replacement or full refund including return courier
              fees is guaranteed.
            </li>
            <li>
              <strong className="text-foreground">2-Year Authorized Warranty:</strong> Electronic
              appliances and smart devices carry the official 2-year agent warranty mandated by the
              Ministry of Commerce.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">6. Contact Support</h2>
          <p className="mt-2 text-muted-foreground">
            Our customer care team is available daily to assist with orders, tracking, or warranty
            inquiries.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={localizePath('/', lang)}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-xs font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              Back to Storefront
            </Link>
            <Link
              href={localizePath('/privacy', lang)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Privacy Policy
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
