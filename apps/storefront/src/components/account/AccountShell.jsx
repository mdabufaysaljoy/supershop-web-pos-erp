'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { localizePath, splitLocale } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_PATHS } from '@/lib/accountApi';
import { useAuth } from './AuthProvider';

/** Shared page furniture for the signed-in area: tabs, guard and sign-out. */
const TABS = [
  { path: ACCOUNT_PATHS.home, key: 'account.nav.profile' },
  { path: ACCOUNT_PATHS.orders, key: 'account.nav.orders' },
  { path: ACCOUNT_PATHS.addresses, key: 'account.nav.addresses' },
];

/**
 * Guards the account pages in the browser: they render nothing personal on the server, so a guest
 * is simply sent to sign in and brought back to where they wanted to go.
 */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lang = useLang();
  const t = useT();

  useEffect(() => {
    if (status !== 'guest') return;
    const returnTo = encodeURIComponent(splitLocale(pathname).path);
    router.replace(`${localizePath(ACCOUNT_PATHS.login, lang)}?returnTo=${returnTo}`);
  }, [status, router, pathname, lang]);

  if (status !== 'signedIn')
    return (
      <p className="py-10 text-center text-sm text-muted-foreground" role="status">
        {t('account.loading')}
      </p>
    );
  return children;
}

export function AccountTabs() {
  const t = useT();
  const lang = useLang();
  const pathname = splitLocale(usePathname()).path;
  return (
    <nav aria-label={t('account.title')} className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active =
          tab.path === ACCOUNT_PATHS.home ? pathname === tab.path : pathname.startsWith(tab.path);
        return (
          <Link
            key={tab.path}
            href={localizePath(tab.path, lang)}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Title row + tabs + sign-out, around every account page. */
export function AccountShell({ title, children }) {
  const t = useT();
  const { signOut } = useAuth();
  const router = useRouter();
  const lang = useLang();

  return (
    <RequireAuth>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <button
            type="button"
            className="text-sm underline underline-offset-4 hover:no-underline"
            onClick={async () => {
              await signOut();
              router.replace(localizePath('/', lang));
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
        <AccountTabs />
        {children}
      </div>
    </RequireAuth>
  );
}
