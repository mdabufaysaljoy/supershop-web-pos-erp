import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Site footer: the menus the shop arranged (P5.4), its own note, and the two lines it does not
 * write itself (copyright, VAT). Order tracking stays as a fallback link until a menu names it,
 * so a fresh shop is never without it.
 */
const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

export function SiteFooter({ lang, storeName, pricesIncludeVat, footer = {}, t, fmt }) {
  const menus = footer.menus ?? [];
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-muted-foreground">
        {menus.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {menus.map((menu) => (
              <nav key={menu.id} aria-label={menu.title} className="grid gap-2">
                <h2 className="text-sm font-medium text-foreground">{menu.title}</h2>
                <ul className="grid gap-1.5">
                  {menu.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        className="underline-offset-4 hover:underline"
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
              className="underline-offset-4 hover:underline"
              href={localizePath('/track', lang)}
            >
              {t('track.linkLabel')}
            </Link>
          </nav>
        )}

        <div className="grid gap-1">
          {footer.note && <p>{footer.note}</p>}
          <p>
            {t('footer.rights', { year: fmt.plain(new Date().getFullYear()), store: storeName })}
          </p>
          {pricesIncludeVat && <p>{t('footer.vatIncluded')}</p>}
        </div>
      </div>
    </footer>
  );
}
