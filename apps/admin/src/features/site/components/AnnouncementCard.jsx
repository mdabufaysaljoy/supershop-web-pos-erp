import { SITE } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useUpdateLayout } from '../resource';

/** The strip above the header (P5.4). Staff write English; Arabic is generated (§5.7). */
export function AnnouncementCard({ layout, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({
    enabled: layout.announcement.enabled,
    text: layout.announcement.text?.en ?? '',
    href: layout.announcement.href ?? '',
    tone: layout.announcement.tone,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const err = (field) => fieldMessage(t, errors[`announcement.${field}`]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.announcement.title')}</CardTitle>
        <CardDescription>{t('appearance.announcement.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Checkbox
          id="announcement-enabled"
          label={t('appearance.announcement.show')}
          checked={draft.enabled}
          disabled={disabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <FormField label={t('appearance.announcement.text')} error={err('text')}>
          <PlainTextInput
            value={draft.text}
            maxLength={SITE.ANNOUNCEMENT_MAX}
            disabled={disabled}
            onChange={(e) => set({ text: e.target.value })}
          />
        </FormField>
        <ArabicPreview label={t('cms.builder.arabic')} value={layout.announcement.text} />
        <FormField
          label={t('appearance.announcement.href')}
          description={t('appearance.announcement.hrefHelp')}
          error={err('href')}
        >
          <PlainTextInput
            value={draft.href}
            dir="ltr"
            disabled={disabled}
            onChange={(e) => set({ href: e.target.value })}
          />
        </FormField>
        <FormField label={t('appearance.announcement.tone')}>
          <Select
            value={draft.tone}
            disabled={disabled}
            onChange={(e) => set({ tone: e.target.value })}
          >
            {SITE.TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`appearance.tones.${tone}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <Button
          type="button"
          className="justify-self-start"
          disabled={disabled || save.isPending}
          onClick={() => run(save.mutateAsync({ announcement: draft }))}
        >
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
