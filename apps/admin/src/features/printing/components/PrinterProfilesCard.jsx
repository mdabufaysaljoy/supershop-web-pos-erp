import { PRINTING } from '@supershop/shared';
import { FormField, NameInput, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { useCreatePrinter, useDeletePrinter, useUpdatePrinter } from '../resource';

const INITIAL = {
  name: '',
  printer: '',
  kind: 'receipt',
  widthMm: 80,
  cut: true,
  openDrawer: false,
  isDefault: true,
};

/**
 * Settings → Printing: the shop's receipt and label printer profiles (P6.3/P6.4).
 */
export function PrinterProfilesCard({ profiles = [], discoveredPrinters = [], canEdit }) {
  const { t } = useTranslation();
  const create = useCreatePrinter();
  const update = useUpdatePrinter();
  const remove = useDeletePrinter();
  const [form, setForm] = useState(INITIAL);

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.printer.trim()) return;
    create.mutate(
      {
        ...form,
        name: form.name.trim(),
        printer: form.printer.trim(),
        widthMm: Number(form.widthMm),
      },
      { onSuccess: () => setForm(INITIAL) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('printing.profiles.title')}</h2>
        </CardTitle>
        <CardDescription>{t('printing.profiles.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('printing.profiles.empty')}</p>
        ) : (
          <ul aria-label={t('printing.profiles.title')} className="grid gap-3">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge tone="muted">{t(`printing.profiles.kinds.${p.kind}`)}</Badge>
                    <Badge tone="muted">{t('printing.profiles.mm', { mm: p.widthMm })}</Badge>
                    {p.isDefault && <Badge tone="ok">{t('printing.profiles.default')}</Badge>}
                  </div>
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {p.printer}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!p.isDefault && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: p.id, body: { isDefault: true } })}
                      >
                        {t('printing.profiles.makeDefault')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(p.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form onSubmit={submit} className="grid gap-4 border-t pt-4">
            <h3 className="text-sm font-semibold">{t('printing.profiles.addTitle')}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label={t('printing.profiles.name')}>
                <NameInput
                  placeholder={t('printing.profiles.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </FormField>

              <FormField label={t('printing.profiles.osPrinter')}>
                <PlainTextInput
                  dir="ltr"
                  list="qz-discovered-printers"
                  placeholder={t('printing.profiles.osPrinterPlaceholder')}
                  value={form.printer}
                  onChange={(e) => setForm((s) => ({ ...s, printer: e.target.value }))}
                />
                {discoveredPrinters.length > 0 && (
                  <datalist id="qz-discovered-printers">
                    {discoveredPrinters.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </FormField>

              <FormField label={t('printing.profiles.kind')}>
                <Select
                  value={form.kind}
                  onChange={(e) => setForm((s) => ({ ...s, kind: e.target.value }))}
                >
                  {PRINTING.KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`printing.profiles.kinds.${k}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label={t('printing.profiles.paperWidth')}>
                <Select
                  value={form.widthMm}
                  onChange={(e) => setForm((s) => ({ ...s, widthMm: Number(e.target.value) }))}
                >
                  {PRINTING.WIDTHS_MM.map((w) => (
                    <option key={w} value={w}>
                      {t('printing.profiles.mm', { mm: w })}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="flex flex-wrap gap-6">
              <Checkbox
                id="printer-cut"
                label={t('printing.profiles.cut')}
                checked={form.cut}
                onChange={(e) => setForm((s) => ({ ...s, cut: e.target.checked }))}
              />
              <Checkbox
                id="printer-drawer"
                label={t('printing.profiles.openDrawer')}
                checked={form.openDrawer}
                onChange={(e) => setForm((s) => ({ ...s, openDrawer: e.target.checked }))}
              />
              <Checkbox
                id="printer-default"
                label={t('printing.profiles.setAsDefault')}
                checked={form.isDefault}
                onChange={(e) => setForm((s) => ({ ...s, isDefault: e.target.checked }))}
              />
            </div>

            <div>
              <Button
                type="submit"
                disabled={create.isPending || !form.name.trim() || !form.printer.trim()}
              >
                {t('printing.profiles.addButton')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
