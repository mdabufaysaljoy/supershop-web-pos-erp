'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

/** Small pieces shared by the sign-in, register and password forms. */

/** Where to go after signing in: only a path on this site (never an absolute URL). */
export function useReturnTo(fallback = '/account') {
  const params = useSearchParams();
  const raw = params.get('returnTo');
  return useMemo(
    () => (raw && /^\/(?!\/)[\w\-./?=&%+#]*$/.test(raw) ? raw : fallback),
    [raw, fallback],
  );
}

export function AuthCard({ title, description, error, success, children }) {
  return (
    <div className="mx-auto grid w-full max-w-md gap-5">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {success}
        </p>
      )}
      {children}
    </div>
  );
}

export function SubmitButton({ busy, label, busyLabel, disabled, className }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={
        className ||
        'h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 disabled:opacity-60 transition-all'
      }
    >
      {busy ? busyLabel : label}
    </button>
  );
}

/**
 * Sign in with Google. A plain link, not fetch: the API redirects the browser to Google and back,
 * and the session arrives as a cookie — no token ever reaches JavaScript or a URL.
 */
export function GoogleButton({ href, label, or }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {or}
        <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href={href}
        className="flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-muted"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-3l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
          />
          <path fill="#FBBC05" d="M5.3 14.2a7.1 7.1 0 0 1 0-4.5V6.6h-4a12 12 0 0 0 0 10.8l4-3.2Z" />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
          />
        </svg>
        {label}
      </a>
    </div>
  );
}
