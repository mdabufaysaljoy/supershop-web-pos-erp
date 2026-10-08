import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Site header. Menus are admin-built (P5.4); the EN/AR language switcher lands in P0.12.
 * Logical spacing only (RTL-safe).
 */
export function SiteHeader({ lang, storeName, t }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href={localizePath('/', lang)} className="text-lg font-semibold">
          {storeName}
        </Link>
        <nav aria-label={t('nav.primary')} className="ms-auto flex items-center gap-4 text-sm">
          <Link
            href={localizePath('/', lang)}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('nav.home')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
