import { SITE } from '@supershop/shared';
import { AddressInput, EmailInput, FormField, PhoneInput, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useUpdateLayout } from '../resource';

/**
 * How customers reach the shop, and where it is online (P5.5). The address is content (translated
 * like any other); phone numbers, emails and profile links are not — they are the same in every
 * language, and a translation provider never sees them (§5.7).
 */
export function ContactCard({ layout, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({
    phone: layout.contact.phone,
    whatsapp: layout.contact.whatsapp,
    email: layout.contact.email,
    address: layout.contact.address?.en ?? '',
    nationalAddress: layout.contact.nationalAddress,
    mapUrl: layout.contact.mapUrl,
  });
  const [social, setSocial] = useState(layout.social);
  const [adding, setAdding] = useState({ platform: SITE.SOCIAL[0], url: '' });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const err = (field) => fieldMessage(t, errors[`contact.${field}`]);
  const used = new Set(social.map((link) => link.platform));
  const free = SITE.SOCIAL.filter((platform) => !used.has(platform));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.contact.title')}</CardTitle>
        <CardDescription>{t('appearance.contact.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('appearance.contact.phone')} error={err('phone')}>
          <PhoneInput
            value={draft.phone}
            disabled={disabled}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('appearance.contact.whatsapp')}
          description={t('appearance.contact.whatsappHelp')}
          error={err('whatsapp')}
        >
          <PhoneInput
            value={draft.whatsapp}
            disabled={disabled}
            onChange={(e) => set({ whatsapp: e.target.value })}
          />
        </FormField>
        <FormField label={t('appearance.contact.email')} error={err('email')}>
          <EmailInput
            value={draft.email}
            disabled={disabled}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('appearance.contact.nationalAddress')}
          description={t('appearance.contact.nationalAddressHelp')}
          error={err('nationalAddress')}
        >
          <PlainTextInput
            value={draft.nationalAddress}
            dir="ltr"
            disabled={disabled}
            onChange={(e) => set({ nationalAddress: e.target.value })}
          />
        </FormField>
        <FormField
          className="sm:col-span-2"
          label={t('appearance.contact.address')}
          error={err('address')}
        >
          <AddressInput
            value={draft.address}
            disabled={disabled}
            onChange={(e) => set({ address: e.target.value })}
          />
        </FormField>
        <ArabicPreview label={t('cms.builder.arabic')} value={layout.contact.address} />
        <FormField
          className="sm:col-span-2"
          label={t('appearance.contact.mapUrl')}
          error={err('mapUrl')}
        >
          <PlainTextInput
            value={draft.mapUrl}
            dir="ltr"
            disabled={disabled}
            onChange={(e) => set({ mapUrl: e.target.value })}
          />
        </FormField>

        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="text-sm leading-none font-medium">
            {t('appearance.contact.social')}
          </legend>
          {social.map((link) => (
            <div
              key={link.platform}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{t(`appearance.platforms.${link.platform}`)}</span>
              <span dir="ltr" className="flex-1 truncate text-muted-foreground">
                {link.url}
              </span>
              <button
                type="button"
                className="text-xs underline"
                disabled={disabled}
                onClick={() => setSocial(social.filter((x) => x.platform !== link.platform))}
              >
                {t('common.remove')}
              </button>
            </div>
          ))}
          {free.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
              <FormField label={t('appearance.contact.platform')}>
                <Select
                  value={adding.platform}
                  disabled={disabled}
                  onChange={(e) => setAdding((a) => ({ ...a, platform: e.target.value }))}
                >
                  {free.map((platform) => (
                    <option key={platform} value={platform}>
                      {t(`appearance.platforms.${platform}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label={t('appearance.contact.profileUrl')}
                error={fieldMessage(t, errors['social.0.url'])}
              >
                <PlainTextInput
                  value={adding.url}
                  dir="ltr"
                  disabled={disabled}
                  onChange={(e) => setAdding((a) => ({ ...a, url: e.target.value }))}
                />
              </FormField>
              <Button
                type="button"
                variant="outline"
                disabled={disabled || !adding.url}
                onClick={() => {
                  setSocial([...social, adding]);
                  setAdding({
                    platform: free.find((p) => p !== adding.platform) ?? free[0],
                    url: '',
                  });
                }}
              >
                {t('common.add')}
              </Button>
            </div>
          )}
        </fieldset>

        <Button
          type="button"
          className="justify-self-start sm:col-span-2"
          disabled={disabled || save.isPending}
          onClick={() => run(save.mutateAsync({ contact: draft, social }))}
        >
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
