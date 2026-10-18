import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Site footer: the menus the shop arranged (P5.4), its own note, and the two lines it does not
 * write itself (copyright, VAT). Order tracking stays as a fallback link until a menu names it,
 * so a fresh shop is never without it.
 */
const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

/** `instagram` → the label the dictionary has for it; the URL is the shop's own. */
export function SiteFooter({
  lang,
  storeName,
  pricesIncludeVat,
  footer = {},
  contact = {},
  social = [],
  t,
  fmt,
}) {
  const menus = footer.menus ?? [];
  const hasContact = Boolean(contact.phone || contact.email || contact.address);
  return (
    <footer className="mt-20 border-t border-border/80 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-12 text-sm text-muted-foreground">
        <div className="grid gap-10 md:grid-cols-12 pb-10 border-b border-border/60">
          {/* Brand Col */}
          <div className="grid gap-3 md:col-span-4">
            <span className="text-xl font-bold tracking-tight text-foreground">{storeName}</span>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              {t('site.tagline')}
            </p>
            {footer.note && <p className="text-xs text-foreground/80">{footer.note}</p>}
          </div>

          {/* Menus Col */}
          <div className="md:col-span-8">
            {menus.length > 0 ? (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {menus.map((menu) => (
                  <nav key={menu.id} aria-label={menu.title} className="grid gap-3">
                    <h2 className="text-sm font-bold tracking-tight text-foreground">
                      {menu.title}
                    </h2>
                    <ul className="grid gap-2 text-xs">
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
            ) : (
              <nav aria-label={t('footer.links')}>
                <Link
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  href={localizePath('/track', lang)}
                >
                  <span aria-hidden="true">📦</span>
                  <span>{t('track.linkLabel')}</span>
                </Link>
              </nav>
            )}
          </div>
        </div>

        {/* Contact & Social Section */}
        {(hasContact || social.length > 0) && (
          <div className="grid gap-4 py-8 sm:flex sm:flex-wrap sm:items-start sm:justify-between border-b border-border/60">
            {hasContact && (
              <address className="grid gap-1.5 not-italic text-xs">
                <h2 className="text-sm font-bold text-foreground">{t('footer.contact')}</h2>
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
                    <span>{t('footer.whatsapp')}</span>
                  </a>
                )}
              </address>
            )}

            {social.length > 0 && (
              <nav aria-label={t('footer.social')} className="flex flex-wrap items-center gap-3">
                {social.map((link) => (
                  <a
                    key={link.platform}
                    href={link.url}
                    rel="noreferrer noopener me"
                    target="_blank"
                    className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-all hover:bg-muted hover:text-foreground"
                  >
                    {t(`footer.platforms.${link.platform}`)}
                  </a>
                ))}
              </nav>
            )}
          </div>
        )}

        {/* Payment Methods & Legal Badges */}
        <div className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Mada</span>
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Apple Pay</span>
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Visa</span>
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Mastercard</span>
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Tabby</span>
            <span className="rounded bg-background border px-2 py-1 shadow-2xs">Tamara</span>
          </div>

          <div className="grid gap-0.5 text-start sm:text-end text-[11px]">
            <p>
              {t('footer.rights', { year: fmt.plain(new Date().getFullYear()), store: storeName })}
            </p>
            {pricesIncludeVat && <p className="text-muted-foreground">{t('footer.vatIncluded')}</p>}
          </div>
        </div>
      </div>
    </footer>
  );
}
