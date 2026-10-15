import { THEME, themeCssVars } from '@supershop/shared';
import { FormField } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useUpdateLayout } from '../resource';

/**
 * Theme tokens (P5.4): two colours, a corner radius and which bundled font the site uses. The
 * preview is drawn with the SAME variables the storefront gets, so what is shown is what ships.
 */
export function ThemeCard({ layout, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({ ...THEME.DEFAULTS, ...layout.theme });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const err = (field) => fieldMessage(t, errors[`theme.${field}`]);
  const preview = themeCssVars(draft);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.theme.title')}</CardTitle>
        <CardDescription>{t('appearance.theme.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {['primary', 'primaryForeground'].map((field) => (
          <FormField key={field} label={t(`appearance.theme.${field}`)} error={err(field)}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-9 rounded-md border bg-transparent"
                value={draft[field]}
                disabled={disabled}
                aria-label={t(`appearance.theme.${field}`)}
                onChange={(e) => set({ [field]: e.target.value })}
              />
              <output className="font-mono text-xs text-muted-foreground">{draft[field]}</output>
            </div>
          </FormField>
        ))}

        <FormField label={t('appearance.theme.radius')} error={err('radius')}>
          <Select
            value={draft.radius}
            disabled={disabled}
            onChange={(e) => set({ radius: e.target.value })}
          >
            {THEME.RADII.map((radius) => (
              <option key={radius} value={radius}>
                {t(`appearance.radii.${radius}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('appearance.theme.font')} error={err('font')}>
          <Select
            value={draft.font}
            disabled={disabled}
            onChange={(e) => set({ font: e.target.value })}
          >
            {THEME.FONTS.map((font) => (
              <option key={font} value={font}>
                {t(`appearance.fonts.${font}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <div
          style={preview}
          className="grid gap-2 rounded-[var(--radius)] border p-4 sm:col-span-2"
          aria-label={t('appearance.theme.preview')}
        >
          <span className="text-sm font-medium">{t('appearance.theme.preview')}</span>
          <span
            className="inline-flex h-10 w-fit items-center rounded-[var(--radius)] px-5 text-sm font-medium"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {t('appearance.theme.previewButton')}
          </span>
        </div>

        <Button
          type="button"
          className="justify-self-start sm:col-span-2"
          disabled={disabled || save.isPending}
          onClick={() => run(save.mutateAsync({ theme: draft }))}
        >
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
