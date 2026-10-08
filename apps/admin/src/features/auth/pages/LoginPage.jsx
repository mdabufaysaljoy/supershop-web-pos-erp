import { zodResolver } from '@hookform/resolvers/zod';
import { createAuthSchemas } from '@supershop/shared';
import { EmailInput, FormField, PasswordInput } from '@supershop/ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage, fieldMessage } from '@/lib/i18n';
import { safeNextPath } from '@/lib/permissions';
import { useLogin } from '../hooks';
import { useAuthStore } from '../store';

// Same schema the API validates with (login does not apply the password policy).
const { staffLogin } = createAuthSchemas();

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = useAuthStore((s) => s.status);
  const login = useLogin();
  const next = safeNextPath(params.get('next'));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(staffLogin), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(next, { replace: true }) }),
  );

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t('auth.signInTitle')}</h1>
          </CardTitle>
          <CardDescription>{t('auth.signInSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            {login.isError && <Alert variant="destructive">{errorMessage(t, login.error)}</Alert>}

            <FormField label={t('auth.email')} error={fieldMessage(t, errors.email?.message)}>
              {/* "username" lets password managers pair this field with the password. */}
              <EmailInput autoComplete="username" autoFocus {...register('email')} />
            </FormField>

            <FormField label={t('auth.password')} error={fieldMessage(t, errors.password?.message)}>
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
        </CardContent>
      </Card>
    </main>
  );
}
