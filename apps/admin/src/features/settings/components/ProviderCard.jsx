import { FormField, IntegerInput, PasswordInput, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldMessage } from '@/lib/i18n';
import { useSaveSettings, useTestProvider } from '../hooks';
import { Select } from './controls';

const byKey = (list) => Object.fromEntries((list ?? []).map((s) => [s.key, s]));

/** Machine-translation provider, URL, API key (secret) and monthly budget. */
export function ProviderCard({ settings, overview, canEdit }) {
  if (!settings) return null;
  const s = byKey(settings);
  const initial = {
    provider: s['i18n.provider']?.value,
    url: s['i18n.libretranslateUrl']?.value,
    budget: String(s['i18n.monthlyCharBudget']?.value ?? 0),
  };
  // Keyed on the saved values: the form re-initializes whenever the server data changes.
  return (
    <ProviderForm
      key={JSON.stringify(initial)}
      initial={initial}
      s={s}
      overview={overview}
      canEdit={canEdit}
    />
  );
}

function ProviderForm({ initial, s, overview, canEdit }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const test = useTestProvider();
  const [form, setForm] = useState(initial);
  const [apiKey, setApiKey] = useState('');

  const errors = Object.fromEntries((save.error?.details ?? []).map((d) => [d.path, d.message]));
  const keyInfo = s['i18n.libretranslateApiKey']?.value;

  const submit = (e) => {
    e.preventDefault();
    const changes = [
      { key: 'i18n.provider', value: form.provider },
      { key: 'i18n.libretranslateUrl', value: form.url },
      { key: 'i18n.monthlyCharBudget', value: Number(form.budget || 0) },
    ];
    if (apiKey) changes.push({ key: 'i18n.libretranslateApiKey', value: apiKey });
    save.mutate(changes, { onSuccess: () => setApiKey('') });
  };

  const usage = overview?.usage;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('languages.provider.title')}</h2>
        </CardTitle>
        <CardDescription>{t('languages.provider.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <FormField
            label={t('languages.provider.engine')}
            error={fieldMessage(t, errors['i18n.provider'])}
          >
            <Select
              value={form.provider}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            >
              <option value="noop">{t('languages.provider.off')}</option>
              <option value="libretranslate">{t('languages.provider.libretranslate')}</option>
            </Select>
          </FormField>
          <FormField
            label={t('languages.provider.url')}
            error={fieldMessage(t, errors['i18n.libretranslateUrl'])}
          >
            <PlainTextInput
              dir="ltr"
              value={form.url}
              disabled={!canEdit || form.provider !== 'libretranslate'}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('languages.provider.apiKey')}
            description={
              keyInfo?.isSet
                ? t('languages.provider.apiKeySet', { masked: keyInfo.masked })
                : t('languages.provider.apiKeyHelp')
            }
            error={fieldMessage(t, errors['i18n.libretranslateApiKey'])}
          >
            <PasswordInput
              autoComplete="off"
              value={apiKey}
              disabled={!canEdit || form.provider !== 'libretranslate'}
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('languages.provider.budget')}
            description={t('languages.provider.budgetHelp')}
            error={fieldMessage(t, errors['i18n.monthlyCharBudget'])}
          >
            <IntegerInput
              value={form.budget}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </FormField>

          {usage && (
            <p className="text-sm text-muted-foreground md:col-span-2">
              {t('languages.provider.usage', {
                month: usage.month,
                chars: usage.chars.toLocaleString('en'),
                budget: usage.budget
                  ? usage.budget.toLocaleString('en')
                  : t('languages.provider.unlimited'),
              })}
            </p>
          )}

          {test.data && (
            <Alert variant={test.data.ok ? 'default' : 'destructive'} className="md:col-span-2">
              {test.data.ok
                ? t('languages.provider.testOk', {
                    sample: test.data.sample,
                    result: test.data.result,
                    ms: test.data.ms,
                  })
                : test.data.enabled
                  ? t('languages.provider.testFailed')
                  : t('languages.provider.testOff')}
            </Alert>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {t('common.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                {test.isPending ? t('languages.provider.testing') : t('languages.provider.test')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
