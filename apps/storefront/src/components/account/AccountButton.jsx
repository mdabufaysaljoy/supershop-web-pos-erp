'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_PATHS } from '@/lib/accountApi';
import { useAuth } from './AuthProvider';

/**
 * Header entry to the account area. Renders the same link for guests and customers until the
 * browser knows who is here (the page HTML is cached and identical for everyone — §5.4).
 */
export function AccountButton() {
  const t = useT();
  const lang = useLang();
  const { status, profile } = useAuth();
  const signedIn = status === 'signedIn';
  const firstName = profile?.name?.trim().split(/\s+/)[0];

  return (
    <Link
      href={localizePath(signedIn ? ACCOUNT_PATHS.home : ACCOUNT_PATHS.login, lang)}
      className="flex h-10 items-center gap-2 rounded-full border px-3 text-sm hover:bg-muted"
      aria-label={signedIn ? t('account.nav.account') : t('account.signIn.title')}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-4"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
      </svg>
      <span className="hidden sm:inline">
        {signedIn ? (firstName ?? t('account.nav.account')) : t('account.signIn.short')}
      </span>
    </Link>
  );
}
