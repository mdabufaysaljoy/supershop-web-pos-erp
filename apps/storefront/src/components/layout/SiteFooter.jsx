import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';

const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

/**
 * Official Vibrant Social Media Brand SVGs & Signatures
 */
const SOCIAL_ICONS = {
  instagram: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] text-white shadow-xs transition-transform hover:scale-110">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    </span>
  ),
  tiktok: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-black text-white shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.32a6.34 6.34 0 0 0-.85-.06A6.34 6.34 0 0 0 3.14 15.6a6.34 6.34 0 0 0 9.29 5.58 6.3 6.3 0 0 0 3.39-5.51V8.71a8.27 8.27 0 0 0 4.77 1.5v-3.4a4.85 4.85 0 0 1-1-.12z" />
      </svg>
    </span>
  ),
  snapchat: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-[#FFFC00] text-black shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4.5" aria-hidden="true">
        <path d="M12.03 2c-3.32 0-5.83 2.38-5.83 5.48 0 1.05.32 2.22.39 2.47-.21.08-.85.34-1.29.56-.47.24-.76.54-.76.9 0 .54.67.92 1.37 1.15.1.03.18.1.18.21 0 .39-.62 1.63-1.63 2.24-.4.24-.59.48-.59.73 0 .44.59.76 1.48.76.5 0 1.07-.11 1.7-.33.42-.15.82-.12 1.09.11.45.38 1.54 1.72 3.89 1.72 2.34 0 3.44-1.34 3.89-1.72.27-.23.67-.26 1.09-.11.63.22 1.2.33 1.7.33.89 0 1.48-.32 1.48-.76 0-.25-.19-.49-.59-.73-1.01-.61-1.63-1.85-1.63-2.24 0-.11.08-.18.18-.21.7-.23 1.37-.61 1.37-1.15 0-.36-.29-.66-.76-.9-.44-.22-1.08-.48-1.29-.56.07-.25.39-1.42.39-2.47 0-3.1-2.51-5.48-5.84-5.48z" />
      </svg>
    </span>
  ),
  x: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-black text-white shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </span>
  ),
  youtube: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-[#FF0000] text-white shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    </span>
  ),
  whatsapp: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.45 0-2.87-.38-4.12-1.11l-.3-.17-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.45c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
      </svg>
    </span>
  ),
  facebook: (
    <span className="flex size-8 items-center justify-center rounded-xl bg-[#1877F2] text-white shadow-xs transition-transform hover:scale-110">
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </span>
  ),
};

export function SiteFooter({
  lang,
  storeName,
  pricesIncludeVat,
  footer = {},
  contact = {},
  social = [],
  seoDescription = '',
  categories = [],
  t,
  fmt,
}) {
  const menus = footer.menus ?? [];
  const hasContact = Boolean(contact.phone || contact.email || contact.address || contact.whatsapp);
  const activeDescription =
    footer.note ||
    seoDescription ||
    (t ? t('site.tagline') : 'Everyday essentials delivered across the Kingdom.');

  const categoryList =
    categories.length > 0
      ? categories.slice(0, 5)
      : [
          { name: 'Mobiles & Gadgets', href: '/search?q=mobile' },
          { name: 'Audio & Sound', href: '/search?q=audio' },
          { name: 'Computing & Tech', href: '/search?q=laptop' },
          { name: 'Fashion & Apparel', href: '/search?q=clothing' },
          { name: 'Smart Home', href: '/search?q=home' },
        ];

  return (
    <footer className="mt-20 border-t border-border/80 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-12 text-sm text-muted-foreground">
        {/* Top 5-Column Navigation Grid */}
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-12 pb-10 border-b border-border/60">
          {/* Col 1: Brand & Store Info */}
          <div className="grid gap-3 sm:col-span-2 md:col-span-4">
            <Link
              href={localizePath('/', lang)}
              className="text-xl font-bold tracking-tight text-foreground hover:opacity-90 inline-block"
            >
              {storeName}
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              {activeDescription}
            </p>
            {footer.note && footer.note !== activeDescription && (
              <p className="text-xs text-foreground/80 font-medium">{footer.note}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Saudi Ministry of Commerce CR Compliant</span>
            </div>
          </div>

          {/* Col 2: Shop & Catalog */}
          <nav aria-label="Shop Catalog" className="grid gap-3 md:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Shop & Browse
            </h2>
            <ul className="grid gap-2 text-xs">
              <li>
                <Link
                  className="hover:text-foreground hover:underline"
                  href={localizePath('/search', lang)}
                >
                  {t ? t('nav.allProducts') : 'All Products'}
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-foreground hover:underline"
                  href={`${localizePath('/search', lang)}?sort=best_selling`}
                >
                  Best Sellers
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-foreground hover:underline"
                  href={`${localizePath('/search', lang)}?sort=newest`}
                >
                  {t ? t('home.newArrivals') : 'New Arrivals'}
                </Link>
              </li>
              <li>
                <Link
                  className="font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  href={`${localizePath('/search', lang)}?sort=price_asc`}
                >
                  🔥 Super Deals
                </Link>
              </li>
            </ul>
          </nav>

          {/* Col 3: Categories */}
          <nav aria-label="Categories" className="grid gap-3 md:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t ? t('catalog.categories') : 'Categories'}
            </h2>
            <ul className="grid gap-2 text-xs">
              {categoryList.map((c, idx) => (
                <li key={c.id ?? idx}>
                  <Link
                    className="hover:text-foreground hover:underline"
                    href={
                      c.slug ? localizePath(categoryPath(c.slug), lang) : localizePath(c.href, lang)
                    }
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Col 4: Customer Care & Orders */}
          <nav aria-label="Customer Care" className="grid gap-3 md:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Customer Care
            </h2>
            <ul className="grid gap-2 text-xs">
              <li>
                <Link
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  href={localizePath('/track', lang)}
                >
                  <span aria-hidden="true">📦</span>
                  <span>{t ? t('track.linkLabel') : 'Track your order'}</span>
                </Link>
              </li>
              <li>
                <span className="text-muted-foreground/80">Kingdom Express Dispatch</span>
              </li>
              <li>
                <span className="text-muted-foreground/80">14-Day Free Returns</span>
              </li>
              <li>
                <span className="text-muted-foreground/80">Authorized KSA Warranty</span>
              </li>
            </ul>
          </nav>

          {/* Col 5: Legal & Policies */}
          <nav aria-label="Policies and Legal" className="grid gap-3 md:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Legal & Privacy
            </h2>
            <ul className="grid gap-2 text-xs">
              <li>
                <Link
                  className="hover:text-foreground hover:underline"
                  href={localizePath('/privacy', lang)}
                >
                  {t ? t('consent.privacyPolicy') || 'Privacy Policy' : 'Privacy Policy'}
                </Link>
              </li>
              <li>
                <Link
                  className="hover:text-foreground hover:underline"
                  href={localizePath('/terms', lang)}
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <span className="text-muted-foreground/80">PDPL Compliant</span>
              </li>
              <li>
                <span className="text-muted-foreground/80">15% VAT Included</span>
              </li>
            </ul>
          </nav>
        </div>

        {/* Custom arranged menus if the shop created specific ones in CMS */}
        {menus.length > 0 && (
          <div className="grid gap-6 py-6 border-b border-border/60 sm:grid-cols-2 md:grid-cols-3">
            {menus.map((menu) => (
              <nav key={menu.id} aria-label={menu.title} className="grid gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {menu.title}
                </h3>
                <ul className="grid gap-1.5 text-xs">
                  {menu.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        className="transition-colors hover:text-foreground hover:underline"
                        href={linkHref(item.href, lang)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        )}

        {/* Contact Details & Colorful Social Media Logos */}
        {(hasContact || social.length > 0) && (
          <div
            id="contact"
            className="grid gap-6 py-8 sm:flex sm:flex-wrap sm:items-center sm:justify-between border-b border-border/60"
          >
            {hasContact && (
              <address className="grid gap-1.5 not-italic text-xs">
                <h2 className="text-sm font-bold text-foreground">
                  {t ? t('footer.contact') : 'Contact'}
                </h2>
                {contact.address && <span>{contact.address}</span>}
                {contact.phone && (
                  <a
                    className="hover:text-foreground hover:underline"
                    dir="ltr"
                    href={`tel:${contact.phone}`}
                  >
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a
                    className="hover:text-foreground hover:underline"
                    dir="ltr"
                    href={`mailto:${contact.email}`}
                  >
                    {contact.email}
                  </a>
                )}
                {contact.whatsapp && (
                  <a
                    className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline"
                    dir="ltr"
                    href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    <span aria-hidden="true">💬</span>
                    <span>{t ? t('footer.whatsapp') : 'WhatsApp'}</span>
                  </a>
                )}
              </address>
            )}

            {/* Social Profiles with Official Colorful Logos */}
            {social.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                  {t ? t('footer.social') : 'Follow Us'}
                </span>
                <nav
                  aria-label={t ? t('footer.social') : 'Social Profiles'}
                  className="flex flex-wrap items-center gap-2.5"
                >
                  {social.map((link) => {
                    const icon = SOCIAL_ICONS[link.platform] ?? SOCIAL_ICONS.instagram;
                    const platformLabel = t
                      ? t(`footer.platforms.${link.platform}`)
                      : link.platform;
                    return (
                      <a
                        key={link.platform}
                        href={link.url}
                        rel="noreferrer noopener me"
                        target="_blank"
                        aria-label={platformLabel || link.platform}
                        title={platformLabel || link.platform}
                        className="inline-flex items-center gap-2 rounded-xl transition-all"
                      >
                        {icon}
                        <span className="sr-only">{platformLabel || link.platform}</span>
                      </a>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
        )}

        {/* Payment Methods & Legal Badges */}
        <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-foreground">
              Mada
            </span>
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-foreground">
              Apple Pay
            </span>
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-foreground">
              Visa
            </span>
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-foreground">
              Mastercard
            </span>
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-emerald-600">
              Tabby
            </span>
            <span className="rounded-lg bg-background border px-2.5 py-1 shadow-2xs font-bold text-amber-600">
              Tamara
            </span>
          </div>

          <div className="grid gap-0.5 text-start sm:text-end text-[11px]">
            <p>
              {t && fmt
                ? t('footer.rights', {
                    year: fmt.plain(new Date().getFullYear()),
                    store: storeName,
                  })
                : `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
            </p>
            {pricesIncludeVat && (
              <p className="text-muted-foreground">
                {t ? t('footer.vatIncluded') : 'All prices include 15% VAT.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
