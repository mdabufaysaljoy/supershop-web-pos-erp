import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { useSaveSettings } from '@/features/settings/hooks';

/**
 * The gateway behind the "card" method (P4.1): which provider, and its keys. Keys are stored
 * encrypted and never come back — the field shows a mask and only a new value is sent.
 */
const SECRETS = ['payments.moyasar.secretKey', 'payments.moyasar.webhookSecret'];

export function GatewayCard({ settings, canEdit }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [secrets, setSecrets] = useState({});
  const value = (key) => settings?.find((s) => s.key === key)?.value;

  const saveSecret = (key) => {
    const next = secrets[key];
    if (!next) return;
    save.mutate([{ key, value: next }]);
    setSecrets((s) => ({ ...s, [key]: '' }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('payments.gateway.title')}</h2>
        </CardTitle>
        <CardDescription>{t('payments.gateway.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <FormField
          label={t('payments.gateway.provider')}
          description={t('payments.gateway.providerHelp')}
        >
          <Select
            className="max-w-xs"
            value={value('payments.gateway') ?? 'none'}
            disabled={!canEdit || save.isPending}
            onChange={(e) => save.mutate([{ key: 'payments.gateway', value: e.target.value }])}
          >
            <option value="none">{t('payments.gateway.providers.none')}</option>
            <option value="moyasar">{t('payments.gateway.providers.moyasar')}</option>
          </Select>
        </FormField>

        {SECRETS.map((key) => (
          <FormField
            key={key}
            label={t(`payments.gateway.${key.split('.').pop()}`)}
            description={
              // Secrets come back as { isSet, masked } — never the key itself (§5.1).
              value(key)?.isSet
                ? t('payments.gateway.stored', { masked: value(key).masked })
                : t('payments.gateway.notSet')
            }
          >
            <div className="flex gap-2">
              <PlainTextInput
                dir="ltr"
                autoComplete="off"
                placeholder={t('payments.gateway.enterNew')}
                value={secrets[key] ?? ''}
                disabled={!canEdit}
                onChange={(e) => setSecrets((s) => ({ ...s, [key]: e.target.value }))}
              />
              <button
                type="button"
                className="h-9 shrink-0 rounded-full border px-4 text-sm"
                disabled={!canEdit || !secrets[key] || save.isPending}
                onClick={() => saveSecret(key)}
              >
                {t('common.save')}
              </button>
            </div>
          </FormField>
        ))}
      </CardContent>
    </Card>
  );
}
