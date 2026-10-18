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
  {
    path: ACCOUNT_PATHS.home,
    key: 'account.nav.profile',
    icon: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    ),
  },
  {
    path: ACCOUNT_PATHS.orders,
    key: 'account.nav.orders',
    icon: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
    ),
  },
  {
    path: ACCOUNT_PATHS.addresses,
    key: 'account.nav.addresses',
    icon: (
      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
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
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="size-10 animate-spin rounded-full border-3 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground" role="status">
          {t('account.loading')}
        </p>
      </div>
    );
  return children;
}

export function AccountTabs() {
  const t = useT();
  const lang = useLang();
  const pathname = splitLocale(usePathname()).path;
  return (
    <nav aria-label={t('account.title')} className="flex flex-wrap items-center gap-2">
      {TABS.map((tab) => {
        const active =
          tab.path === ACCOUNT_PATHS.home ? pathname === tab.path : pathname.startsWith(tab.path);
        return (
          <Link
            key={tab.path}
            href={localizePath(tab.path, lang)}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-[1.02]'
                : 'border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span>{t(tab.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Title row + tabs + sign-out, around every account page. */
export function AccountShell({ title, children }) {
  const t = useT();
  const { signOut, profile } = useAuth();
  const router = useRouter();
  const lang = useLang();

  return (
    <RequireAuth>
      <div className="space-y-6">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href={localizePath('/', lang)} className="hover:text-foreground transition-colors">
            {t('site.nav.home') || 'Home'}
          </Link>
          <span>/</span>
          <Link
            href={localizePath(ACCOUNT_PATHS.home, lang)}
            className="hover:text-foreground transition-colors"
          >
            {t('account.nav.account') || 'Account'}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{title}</span>
        </div>

        {/* Account Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border/70 bg-gradient-to-r from-card via-card to-primary/[0.04] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-lg shadow-inner select-none">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : '👤'}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profile?.name ? `${profile.name} · ${profile.email || ''}` : t('account.title')}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/50 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
            onClick={async () => {
              await signOut();
              router.replace(localizePath('/', lang));
            }}
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span>{t('account.signOut')}</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <AccountTabs />

        {/* Page Content */}
        <div className="pt-2">{children}</div>
      </div>
    </RequireAuth>
  );
}
