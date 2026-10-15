import { SITE } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useFieldErrors } from '../errors';
import { useUpdateLayout } from '../resource';

/**
 * What search engines are told by default (P5.5): the suffix on every page title, the description
 * used where a page has none, the shop's own robots.txt lines, and the switch that keeps a site
 * that is not open yet out of the index altogether.
 */
export function SeoCard({ layout, disabled }) {
  const { t } = useTranslation();
  const save = useUpdateLayout();
  const { errors, run } = useFieldErrors();
  const [draft, setDraft] = useState({
    titleSuffix: layout.seo.titleSuffix?.en ?? '',
    defaultDescription: layout.seo.defaultDescription?.en ?? '',
    indexable: layout.seo.indexable,
    robotsExtra: layout.seo.robotsExtra,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const err = (field) => fieldMessage(t, errors[`seo.${field}`]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.seo.title')}</CardTitle>
        <CardDescription>{t('appearance.seo.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField
          label={t('appearance.seo.titleSuffix')}
          description={t('appearance.seo.titleSuffixHelp')}
          error={err('titleSuffix')}
        >
          <PlainTextInput
            value={draft.titleSuffix}
            maxLength={SITE.TITLE_SUFFIX_MAX}
            disabled={disabled}
            onChange={(e) => set({ titleSuffix: e.target.value })}
          />
        </FormField>
        <ArabicPreview label={t('cms.builder.arabic')} value={layout.seo.titleSuffix} />

        <FormField label={t('appearance.seo.defaultDescription')} error={err('defaultDescription')}>
          <PlainTextArea
            rows={3}
            value={draft.defaultDescription}
            maxLength={SITE.META_DESCRIPTION_MAX}
            disabled={disabled}
            onChange={(e) => set({ defaultDescription: e.target.value })}
          />
        </FormField>
        <ArabicPreview label={t('cms.builder.arabic')} value={layout.seo.defaultDescription} />

        <Checkbox
          id="seo-indexable"
          label={t('appearance.seo.indexable')}
          description={t('appearance.seo.indexableHelp')}
          checked={draft.indexable}
          disabled={disabled}
          onChange={(e) => set({ indexable: e.target.checked })}
        />

        <FormField
          label={t('appearance.seo.robotsExtra')}
          description={t('appearance.seo.robotsExtraHelp')}
          error={err('robotsExtra')}
        >
          <PlainTextArea
            rows={4}
            dir="ltr"
            className="font-mono text-xs"
            value={draft.robotsExtra}
            maxLength={SITE.ROBOTS_MAX}
            disabled={disabled}
            onChange={(e) => set({ robotsExtra: e.target.value })}
          />
        </FormField>

        <Button
          type="button"
          className="justify-self-start"
          disabled={disabled || save.isPending}
          onClick={() => run(save.mutateAsync({ seo: draft }))}
        >
          {t('common.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
