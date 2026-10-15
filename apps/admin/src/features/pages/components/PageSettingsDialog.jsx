import { PAGE } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput, SlugInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ArabicPreview } from '@/components/ArabicPreview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { pages, useSaveDraft } from '../resource';

/**
 * A page's own details (P5.4): its name, its address, what search engines show, and whether it is
 * the home page. Blocks are the builder's job; this is everything around them.
 *
 * Changing the address of a published page leaves the old one a 404 — the redirects manager in
 * P5.5 is where that gets handled, so the warning here is honest about it.
 */
export function PageSettingsDialog({ page, disabled }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const update = useSaveDraft(page.id);
  const remove = pages.useRemove();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [draft, setDraft] = useState({
    title: page.title?.en ?? '',
    slug: page.slug,
    seoTitle: page.seo?.title?.en ?? '',
    seoDescription: page.seo?.description?.en ?? '',
    isHome: page.isHome,
  });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    try {
      await update.mutateAsync({
        title: draft.title,
        slug: draft.slug,
        seo: { title: draft.seoTitle, description: draft.seoDescription },
        isHome: draft.isHome,
      });
      setOpen(false);
    } catch (err) {
      setErrors(Object.fromEntries((err?.details ?? []).map((d) => [d.path, d.message])));
    }
  };

  const del = async () => {
    await remove.mutateAsync(page.id);
    navigate('/pages');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t('cms.settings.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl" closeLabel={t('common.close')}>
        <DialogTitle>{t('cms.settings.title')}</DialogTitle>
        <DialogDescription>{t('cms.settings.description')}</DialogDescription>
        <form className="grid gap-4" onSubmit={submit}>
          <FormField label={t('cms.settings.name')} error={fieldMessage(t, errors.title)} required>
            <PlainTextInput
              value={draft.title}
              maxLength={PAGE.TITLE_MAX}
              disabled={disabled}
              onChange={(e) => set({ title: e.target.value })}
            />
          </FormField>
          <ArabicPreview label={t('cms.builder.arabic')} value={page.title} />

          <FormField
            label={t('cms.settings.address')}
            description={
              page.status === 'published'
                ? t('cms.settings.addressWarning')
                : t('cms.settings.addressHelp')
            }
            error={fieldMessage(t, errors.slug)}
          >
            <SlugInput
              value={draft.slug}
              disabled={disabled}
              onChange={(e) => set({ slug: e.target.value })}
            />
          </FormField>

          <FormField
            label={t('cms.settings.seoTitle')}
            error={fieldMessage(t, errors['seo.title'])}
          >
            <PlainTextInput
              value={draft.seoTitle}
              maxLength={PAGE.SEO_TITLE_MAX}
              disabled={disabled}
              onChange={(e) => set({ seoTitle: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('cms.settings.seoDescription')}
            error={fieldMessage(t, errors['seo.description'])}
          >
            <PlainTextArea
              rows={3}
              value={draft.seoDescription}
              maxLength={PAGE.SEO_DESCRIPTION_MAX}
              disabled={disabled}
              onChange={(e) => set({ seoDescription: e.target.value })}
            />
          </FormField>

          <Checkbox
            id="page-is-home"
            label={t('cms.settings.isHome')}
            description={t('cms.settings.isHomeHelp')}
            checked={draft.isHome}
            disabled={disabled}
            onChange={(e) => set({ isHome: e.target.checked })}
          />

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="submit" disabled={disabled || update.isPending}>
              {t('common.save')}
            </Button>
            {!disabled && (
              <Button type="button" variant="outline" disabled={remove.isPending} onClick={del}>
                {t('cms.settings.delete')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
