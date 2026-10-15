import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { useSaveSettings } from '@/features/settings/hooks';
import { useSendTest } from '../hooks';

/** Which channels are on, which service carries them, and a way to prove it works. */
const SECRETS = ['notifications.smtpPassword', 'notifications.smsApiKey'];

export function ChannelsCard({ settings, canEdit }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const test = useSendTest();
  const [secrets, setSecrets] = useState({});
  const [to, setTo] = useState({ email: '', sms: '' });

  const value = (key) => settings?.find((s) => s.key === key)?.value;
  const set = (key, v) => save.mutate([{ key, value: v }]);

  /** A plain setting that saves when the field loses focus (like the other settings tabs). */
  const Text = ({ settingKey, type }) => (
    <TextSetting
      label={t(`notifications.settings.${settingKey.split('.').pop()}`)}
      value={value(settingKey)}
      disabled={!canEdit || save.isPending}
      type={type}
      onSave={(v) => set(settingKey, type === 'number' ? Number(v) : v)}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('notifications.settings.title')}</h2>
        </CardTitle>
        <CardDescription>{t('notifications.settings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {['email', 'sms'].map((channel) => (
          <div key={channel} className="grid gap-4 rounded-lg border p-4">
            <Checkbox
              id={`channel-${channel}`}
              label={t(`notifications.settings.${channel}Enabled`)}
              description={t(`notifications.settings.${channel}Help`)}
              checked={Boolean(value(`notifications.${channel}`))}
              disabled={!canEdit || save.isPending}
              onChange={(e) => set(`notifications.${channel}`, e.target.checked)}
            />

            {channel === 'email' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Text settingKey="notifications.emailFrom" />
                <Text settingKey="notifications.emailFromName" />
                {value('notifications.emailProvider') === 'smtp' && (
                  <>
                    <Text settingKey="notifications.smtpHost" />
                    <Text settingKey="notifications.smtpPort" type="number" />
                    <Text settingKey="notifications.smtpUser" />
                  </>
                )}
              </div>
            )}
            {channel === 'sms' && value('notifications.smsProvider') !== 'log' && (
              <Text settingKey="notifications.smsSender" />
            )}

            <FormField label={t('notifications.settings.provider')}>
              <Select
                className="max-w-xs"
                value={value(`notifications.${channel}Provider`) ?? 'log'}
                disabled={!canEdit || save.isPending}
                onChange={(e) => set(`notifications.${channel}Provider`, e.target.value)}
              >
                {(channel === 'email' ? ['log', 'smtp'] : ['log', 'unifonic', 'taqnyat']).map(
                  (p) => (
                    <option key={p} value={p}>
                      {t(`notifications.providers.${p}`)}
                    </option>
                  ),
                )}
              </Select>
            </FormField>

            <div className="flex flex-wrap items-end gap-2">
              <FormField label={t(`notifications.settings.test.${channel}`)}>
                <PlainTextInput
                  dir="ltr"
                  value={to[channel]}
                  disabled={!canEdit}
                  onChange={(e) => setTo({ ...to, [channel]: e.target.value })}
                />
              </FormField>
              <button
                type="button"
                className="h-9 rounded-full border px-4 text-sm"
                disabled={!canEdit || !to[channel] || test.isPending}
                onClick={() => test.mutate({ channel, to: to[channel] })}
              >
                {t('notifications.test.send')}
              </button>
            </div>
          </div>
        ))}

        {SECRETS.map((key) => (
          <FormField
            key={key}
            label={t(`notifications.settings.${key.split('.').pop()}`)}
            description={
              value(key)?.isSet
                ? t('notifications.settings.stored', { masked: value(key).masked })
                : t('notifications.settings.notSet')
            }
          >
            <div className="flex gap-2">
              <PlainTextInput
                dir="ltr"
                autoComplete="off"
                placeholder={t('notifications.settings.enterNew')}
                value={secrets[key] ?? ''}
                disabled={!canEdit}
                onChange={(e) => setSecrets({ ...secrets, [key]: e.target.value })}
              />
              <button
                type="button"
                className="h-9 shrink-0 rounded-full border px-4 text-sm"
                disabled={!canEdit || !secrets[key] || save.isPending}
                onClick={() => {
                  set(key, secrets[key]);
                  setSecrets({ ...secrets, [key]: '' });
                }}
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

/** Saves on blur, so typing never fires a request per keystroke. */
function TextSetting({ label, value, disabled, type, onSave }) {
  const [draft, setDraft] = useState(null);
  const current = draft ?? (value == null ? '' : String(value));
  return (
    <FormField label={label}>
      <PlainTextInput
        dir="ltr"
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={current}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft != null && draft !== String(value ?? '')) onSave(draft);
          setDraft(null);
        }}
      />
    </FormField>
  );
}
