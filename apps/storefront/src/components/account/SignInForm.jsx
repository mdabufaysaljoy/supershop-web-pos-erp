'use client';

import { FormField, PasswordInput, PlainTextInput } from '@supershop/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_PATHS, AUTH_BASE } from '@/lib/accountApi';
import { useAuth } from './AuthProvider';
import { AuthCard, GoogleButton, SubmitButton, useReturnTo } from './authParts';

/**
 * Sign in with email or phone. The API answers the same way for an unknown account and a wrong
 * password, so this form shows one message for both (no account enumeration, §5.1).
 */
export function SignInForm({ googleEnabled }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuth();
  const returnTo = useReturnTo();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.get('error') === 'signin' ? 'account.errors.signin' : null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
      router.replace(localizePath(returnTo, lang));
    } catch (err) {
      setError(
        err.code === 'NETWORK_ERROR'
          ? 'cart.errors.NETWORK_ERROR'
          : err.code === 'ACCOUNT_LOCKED'
            ? 'account.errors.locked'
            : err.code === 'ACCOUNT_DISABLED'
              ? 'account.errors.disabled'
              : 'account.errors.badCredentials',
      );
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('account.signIn.title')} error={error && t(error)}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <FormField
          label={t('account.signIn.identifier')}
          description={t('account.signIn.identifierHint')}
          required
        >
          <PlainTextInput
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </FormField>
        <FormField label={t('account.password.label')} required>
          <PasswordInput
            showLabel={t('account.password.show')}
            hideLabel={t('account.password.hide')}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <SubmitButton
          busy={busy}
          label={t('account.signIn.submit')}
          busyLabel={t('account.signIn.submitting')}
        />
      </form>

      {googleEnabled && (
        <GoogleButton
          label={t('account.signIn.google')}
          href={`${AUTH_BASE}/google/start?returnTo=${encodeURIComponent(localizePath(returnTo, lang))}`}
          or={t('account.or')}
        />
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="underline underline-offset-4"
          href={localizePath(ACCOUNT_PATHS.forgot, lang)}
        >
          {t('account.signIn.forgot')}
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        {t('account.signIn.noAccount')}{' '}
        <Link
          className="underline underline-offset-4"
          href={localizePath(ACCOUNT_PATHS.register, lang)}
        >
          {t('account.signIn.registerLink')}
        </Link>
      </p>
    </AuthCard>
  );
}
