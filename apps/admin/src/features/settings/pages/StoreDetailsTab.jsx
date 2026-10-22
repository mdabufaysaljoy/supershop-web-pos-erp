import { PERMISSIONS as P, SETTING_GROUPS, THEME } from '@supershop/shared';
import { EmailInput, FormField, PhoneInput, PlainTextInput } from '@supershop/ui';
import { Palette, Save, Store } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/features/settings/components/controls';
import { useSaveSettings, useSettings } from '@/features/settings/hooks';
import { useLayout, useUpdateLayout } from '@/features/site/resource';
import { useCan } from '@/lib/permissions';

/** The colours a shop may set, as `[key, label key]`. */
const COLOURS = [
  ['primary', 'settings.store.colours.primary'],
  ['primaryForeground', 'settings.store.colours.primaryForeground'],
  ['secondary', 'settings.store.colours.secondary'],
  ['secondaryForeground', 'settings.store.colours.secondaryForeground'],
];

const CURRENCIES = ['SAR', 'AED', 'USD', 'EUR', 'BHD', 'KWD', 'QAR', 'OMR'];
const TIME_ZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'UTC'];

/**
 * Settings → Store details: who the shop is (its name, VAT number, how it counts money and time),
 * how to reach it, and the two colours the storefront and this admin are painted with.
 *
 * It spans two homes on purpose — the shop's own settings and the site's layout — because that is
 * where each piece belongs; the screen just puts them in one place for the person setting a shop up.
 */
export function StoreDetailsTab() {
  const general = useSettings('general');
  const tax = useSettings('tax');
  const layout = useLayout();

  if (general.isPending || tax.isPending || layout.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-6">
      <IdentityCard
        key={`identity-${general.data?.length ?? 0}`}
        general={general.data ?? []}
        tax={tax.data ?? []}
      />
      <ContactCard key={`contact-${layout.dataUpdatedAt}`} layout={layout.data} />
      <ColoursCard key={`colours-${layout.dataUpdatedAt}`} layout={layout.data} />
    </div>
  );
}

/** The shop's name and the figures every receipt, invoice and report is written with. */
function IdentityCard({ general, tax }) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  // Editing a settings group is its own permission (`general` covers the shop's own details).
  const canEdit = useCan()(SETTING_GROUPS.general);
  const value = (list, key, fallback) => list.find((s) => s.key === key)?.value ?? fallback;
  const [form, setForm] = useState(() => ({
    name: value(general, 'store.name', ''),
    currency: value(general, 'store.currency', 'SAR'),
    timeZone: value(general, 'store.timeZone', 'Asia/Riyadh'),
    vatNumber: value(tax, 'tax.vatNumber', ''),
  }));

  const submit = (e) => {
    e.preventDefault();
    save.mutate([
      { key: 'store.name', value: form.name.trim() },
      { key: 'store.currency', value: form.currency },
      { key: 'store.timeZone', value: form.timeZone },
      { key: 'tax.vatNumber', value: form.vatNumber.trim() },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Store className="size-4 text-primary" aria-hidden />
            {t('settings.store.identity.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('settings.store.identity.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('settings.store.identity.name')}
              description={t('settings.store.identity.nameHint')}
              required
            >
              <PlainTextInput
                maxLength={80}
                disabled={!canEdit}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('settings.store.identity.vatNumber')}
              description={t('settings.store.identity.vatNumberHint')}
            >
              <PlainTextInput
                maxLength={20}
                dir="ltr"
                disabled={!canEdit}
                value={form.vatNumber}
                onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('settings.store.identity.currency')}>
              <Select
                value={form.currency}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('settings.store.identity.timeZone')}>
              <Select
                value={form.timeZone}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              >
                {TIME_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {canEdit && (
            <div>
              <Button type="submit" disabled={save.isPending}>
                <Save className="size-4" aria-hidden />
                {t('common.save')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** How a customer reaches the shop — printed on invoices and shown in the storefront footer. */
function ContactCard({ layout }) {
  const { t } = useTranslation();
  const update = useUpdateLayout();
  const canEdit = useCan()(P.MENU_MANAGE);
  const [form, setForm] = useState(() => ({
    phone: layout?.contact?.phone ?? '',
    whatsapp: layout?.contact?.whatsapp ?? '',
    email: layout?.contact?.email ?? '',
    address: layout?.contact?.address ?? '',
    nationalAddress: layout?.contact?.nationalAddress ?? '',
  }));

  const submit = (e) => {
    e.preventDefault();
    update.mutate({ contact: form });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('settings.store.contact.title')}</h2>
        </CardTitle>
        <CardDescription>{t('settings.store.contact.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('settings.store.contact.phone')}>
              <PhoneInput
                disabled={!canEdit}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label={t('settings.store.contact.whatsapp')}>
              <PhoneInput
                disabled={!canEdit}
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </FormField>
            <FormField label={t('settings.store.contact.email')}>
              <EmailInput
                disabled={!canEdit}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <FormField label={t('settings.store.contact.address')}>
              <PlainTextInput
                maxLength={200}
                disabled={!canEdit}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('settings.store.contact.nationalAddress')}
              description={t('settings.store.contact.nationalAddressHint')}
            >
              <PlainTextInput
                maxLength={40}
                dir="ltr"
                disabled={!canEdit}
                value={form.nationalAddress}
                onChange={(e) => setForm({ ...form, nationalAddress: e.target.value })}
              />
            </FormField>
          </div>
          {canEdit && (
            <div>
              <Button type="submit" disabled={update.isPending}>
                <Save className="size-4" aria-hidden />
                {t('common.save')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** The shop's two colours, which both the storefront and this admin are painted with. */
function ColoursCard({ layout }) {
  const { t } = useTranslation();
  const update = useUpdateLayout();
  const canEdit = useCan()(P.MENU_MANAGE);
  const [form, setForm] = useState(() => ({ ...THEME.DEFAULTS, ...layout?.theme }));

  const submit = (e) => {
    e.preventDefault();
    update.mutate({
      theme: {
        ...Object.fromEntries(COLOURS.map(([key]) => [key, form[key]])),
        radius: form.radius,
        font: form.font,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <Palette className="size-4 text-primary" aria-hidden />
            {t('settings.store.colours.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('settings.store.colours.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COLOURS.map(([key, label]) => (
              <FormField key={key} label={t(label)}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('settings.store.colours.pick', { colour: t(label) })}
                    disabled={!canEdit}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="size-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed"
                  />
                  <PlainTextInput
                    maxLength={7}
                    dir="ltr"
                    disabled={!canEdit}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              </FormField>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('settings.store.colours.radius')}>
              <Select
                value={form.radius}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
              >
                {THEME.RADII.map((r) => (
                  <option key={r} value={r}>
                    {t(`settings.store.colours.radii.${r}`, r)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('settings.store.colours.font')}>
              <Select
                value={form.font}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, font: e.target.value })}
              >
                {THEME.FONTS.map((f) => (
                  <option key={f} value={f}>
                    {t(`settings.store.colours.fonts.${f}`, f)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* What the pair actually looks like, before it is saved. */}
          <div
            aria-label={t('settings.store.colours.preview')}
            className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3"
          >
            <span
              className="rounded-md px-3 py-1.5 text-sm font-semibold"
              style={{ background: form.primary, color: form.primaryForeground }}
            >
              {t('settings.store.colours.primary')}
            </span>
            <span
              className="rounded-md px-3 py-1.5 text-sm font-semibold"
              style={{ background: form.secondary, color: form.secondaryForeground }}
            >
              {t('settings.store.colours.secondary')}
            </span>
          </div>

          {canEdit && (
            <div>
              <Button type="submit" disabled={update.isPending}>
                <Save className="size-4" aria-hidden />
                {t('common.save')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
