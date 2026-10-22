import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@supershop/ui';
import { errorMessage } from '@/lib/i18n';
import * as authApi from '../api';

export function TwoFactorModal({ open, onOpenChange }) {
  const { t } = useTranslation();
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['auth', '2fa-status'],
    queryFn: authApi.get2faStatus,
    enabled: open,
  });

  const setupMutation = useMutation({
    mutationFn: authApi.setup2fa,
    onSuccess: (data) => {
      setSetupData(data);
      setVerifyCode('');
      setRecoveryCodes(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (code) => authApi.verify2fa({ code }),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetupData(null);
      refetch();
    },
  });

  const disableMutation = useMutation({
    mutationFn: (password) => authApi.disable2fa({ password }),
    onSuccess: () => {
      setDisableMode(false);
      setDisablePassword('');
      refetch();
    },
  });

  const handleClose = () => {
    setSetupData(null);
    setVerifyCode('');
    setRecoveryCodes(null);
    setDisableMode(false);
    setDisablePassword('');
    onOpenChange(false);
  };

  const isEnabled = Boolean(status?.enabled);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent closeLabel={t('common.close')} className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          {t('auth.twoFactorTitle')}
        </DialogTitle>
        <DialogDescription>{t('auth.twoFactorSubtitle')}</DialogDescription>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('app.loading')}</div>
        ) : recoveryCodes ? (
          <div className="grid gap-4 py-2">
            <Alert className="border-emerald-500/50 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-200">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('auth.twoFactorRecoveryWarning')}</span>
            </Alert>

            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('auth.twoFactorRecoveryCodes')}
              </span>
              <div className="grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-xs select-all">
                {recoveryCodes.map((code) => (
                  <span key={code} className="text-center font-medium">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            <Button onClick={handleClose} className="w-full mt-2">
              {t('common.done') || 'Done'}
            </Button>
          </div>
        ) : setupData ? (
          <div className="grid gap-4 py-2">
            {verifyMutation.isError && (
              <Alert variant="destructive">{errorMessage(t, verifyMutation.error)}</Alert>
            )}

            <p className="text-sm text-muted-foreground">{t('auth.twoFactorScanQr')}</p>

            <div className="flex justify-center p-3 bg-white rounded border w-fit mx-auto">
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(setupData.qrSvg)}`}
                alt="2FA QR Code"
                className="size-48"
              />
            </div>

            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground text-center">
                {t('auth.twoFactorManualKey')}
              </span>
              <code className="rounded bg-muted p-2 text-center font-mono text-xs tracking-wider select-all">
                {setupData.secret}
              </code>
            </div>

            <div className="grid gap-2 pt-2 border-t">
              <span className="text-sm font-medium">{t('auth.twoFactorEnterCode')}</span>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="123456"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                />
                <Button
                  disabled={verifyCode.length !== 6 || verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate(verifyCode)}
                >
                  {verifyMutation.isPending ? t('auth.verifying') : t('auth.twoFactorActivate')}
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={() => setSetupData(null)} className="w-full text-xs">
              {t('common.cancel')}
            </Button>
          </div>
        ) : isEnabled ? (
          <div className="grid gap-4 py-2">
            <div className="flex items-center justify-between rounded border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{t('auth.twoFactorStatus')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('auth.twoFactorRecoveryCodesLeft')} {status?.recoveryCodesLeft ?? 0}
                </span>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                {t('auth.twoFactorEnabled')}
              </Badge>
            </div>

            {disableMode ? (
              <div className="grid gap-3 rounded border border-destructive/30 bg-destructive/5 p-3">
                {disableMutation.isError && (
                  <Alert variant="destructive">{errorMessage(t, disableMutation.error)}</Alert>
                )}
                <span className="text-xs font-medium text-destructive">
                  {t('auth.twoFactorConfirmPassword')}
                </span>
                <PasswordInput
                  autoFocus
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDisableMode(false);
                      setDisablePassword('');
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!disablePassword || disableMutation.isPending}
                    onClick={() => disableMutation.mutate(disablePassword)}
                  >
                    {disableMutation.isPending ? t('app.loading') : t('auth.disableTwoFactor')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDisableMode(true)}
              >
                <ShieldAlert className="size-4 me-2" />
                {t('auth.disableTwoFactor')}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 py-4 text-center">
            {setupMutation.isError && (
              <Alert variant="destructive">{errorMessage(t, setupMutation.error)}</Alert>
            )}

            <div className="rounded border p-4 bg-muted/30 grid gap-2">
              <p className="text-sm text-muted-foreground">{t('auth.twoFactorSubtitle')}</p>
              <div className="flex justify-center">
                <Badge variant="secondary">{t('auth.twoFactorDisabled')}</Badge>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={setupMutation.isPending}
              onClick={() => setupMutation.mutate()}
            >
              {setupMutation.isPending ? t('app.loading') : t('auth.enableTwoFactor')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
