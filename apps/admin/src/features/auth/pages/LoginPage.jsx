import { zodResolver } from '@hookform/resolvers/zod';
import { createAuthSchemas } from '@supershop/shared';
import { EmailInput, FormField, PasswordInput } from '@supershop/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage, fieldMessage } from '@/lib/i18n';
import { safeNextPath } from '@/lib/permissions';
import { useChallenge2fa, useLogin } from '../hooks';
import { useAuthStore } from '../store';

// Same schemas the API validates with.
const { staffLogin, twoFactorVerify } = createAuthSchemas();

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = useAuthStore((s) => s.status);
  const login = useLogin();
  const challenge = useChallenge2fa();
  const next = safeNextPath(params.get('next'));
  const [mfaToken, setMfaToken] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(staffLogin), defaultValues: { email: '', password: '' } });

  const {
    register: registerChallenge,
    handleSubmit: handleChallengeSubmit,
    formState: { errors: challengeErrors },
    reset: resetChallenge,
  } = useForm({ resolver: zodResolver(twoFactorVerify), defaultValues: { code: '' } });

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const onLoginSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: (data) => {
        if (data?.mfaRequired && data?.mfaToken) {
          setMfaToken(data.mfaToken);
          resetChallenge();
        } else {
          navigate(next, { replace: true });
        }
      },
    }),
  );

  const onChallengeSubmit = handleChallengeSubmit((values) =>
    challenge.mutate(
      { mfaToken, code: values.code },
      { onSuccess: () => navigate(next, { replace: true }) },
    ),
  );

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">
              {mfaToken ? t('auth.twoFactorTitle') : t('auth.signInTitle')}
            </h1>
          </CardTitle>
          <CardDescription>
            {mfaToken ? t('auth.twoFactorSubtitle') : t('auth.signInSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfaToken ? (
            <form className="grid gap-4" onSubmit={onChallengeSubmit} noValidate>
              {challenge.isError && (
                <Alert variant="destructive">{errorMessage(t, challenge.error)}</Alert>
              )}

              <FormField
                label={t('auth.twoFactorCode')}
                error={fieldMessage(t, challengeErrors.code?.message)}
              >
                <Input
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123456"
                  {...registerChallenge('code')}
                />
              </FormField>

              <Button type="submit" className="w-full" disabled={challenge.isPending}>
                {challenge.isPending ? t('auth.verifying') : t('auth.verifyAndSignIn')}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMfaToken(null)}
              >
                {t('auth.backToSignIn')}
              </Button>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={onLoginSubmit} noValidate>
              {login.isError && <Alert variant="destructive">{errorMessage(t, login.error)}</Alert>}

              <FormField label={t('auth.email')} error={fieldMessage(t, errors.email?.message)}>
                <EmailInput autoComplete="username" autoFocus {...register('email')} />
              </FormField>

              <FormField
                label={t('auth.password')}
                error={fieldMessage(t, errors.password?.message)}
              >
                <PasswordInput
                  showLabel={t('auth.showPassword')}
                  hideLabel={t('auth.hidePassword')}
                  {...register('password')}
                />
              </FormField>

              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
