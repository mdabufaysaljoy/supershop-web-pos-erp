import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/** Site footer. Footer menus/content become admin-editable in P5.4. */
export function SiteFooter({ lang, storeName, pricesIncludeVat, t, fmt }) {
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto grid max-w-7xl gap-2 px-4 py-8 text-sm text-muted-foreground">
        <nav aria-label={t('footer.links')}>
          <Link className="underline-offset-4 hover:underline" href={localizePath('/track', lang)}>
            {t('track.linkLabel')}
          </Link>
        </nav>
        <p>{t('footer.rights', { year: fmt.plain(new Date().getFullYear()), store: storeName })}</p>
        {pricesIncludeVat && <p>{t('footer.vatIncluded')}</p>}
      </div>
    </footer>
  );
}
