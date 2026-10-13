import { BRAND, createBrandSchemas } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput, SlugInput } from '@supershop/ui';
import { validators } from '@supershop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { ImageField } from '@/components/ImageField';
import { FormActions } from '@/components/FormActions';
import { Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { detailsToErrors, issuesToDetails } from '@/lib/resource';
import { brands } from '../resource';

const schemas = createBrandSchemas();
const RENAME = { 'seo.title': 'seoTitle', 'seo.description': 'seoDescription' };

const initialForm = (b) => ({
  name: b?.name ?? '',
  slug: b?.slug ?? '',
  website: b?.website ?? '',
  description: b?.description?.en ?? '',
  logo: b?.logo ?? null,
  isActive: b?.isActive ?? true,
  protectName: b?.protectName ?? true,
  seoTitle: b?.seo?.title?.en ?? '',
  seoDescription: b?.seo?.description?.en ?? '',
});

/** Create/edit a brand. The name is never translated; description and SEO text are. */
export function BrandForm({ brand, onDone }) {
  const { t } = useTranslation();
  const create = brands.useCreate();
  const update = brands.useUpdate();
  const remove = brands.useRemove();
  const [form, setForm] = useState(() => initialForm(brand));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !brand;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const check = (key) => (e) => setForm({ ...form, [key]: e.target.checked });

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name,
      website: form.website,
      description: form.description,
      logoId: form.logo?.id ?? null,
      isActive: form.isActive,
      protectName: form.protectName,
      seo: { title: form.seoTitle, description: form.seoDescription },
      ...(form.slug && { slug: form.slug }),
    };
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body);
    if (!parsed.success)
      return setErrors(detailsToErrors(issuesToDetails(parsed.error.issues), RENAME));
    setErrors({});
    try {
      if (isNew) await create.mutateAsync(parsed.data);
      else await update.mutateAsync({ id: brand.id, body: parsed.data });
      onDone();
    } catch (err) {
      setErrors(detailsToErrors(err?.details, RENAME));
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <FormField label={t('brands.form.name')} error={fieldMessage(t, errors.name)} required>
        <PlainTextInput value={form.name} maxLength={BRAND.NAME_MAX} onChange={set('name')} />
      </FormField>
      <FormField
        label={t('categories.form.slug')}
        description={t(isNew ? 'categories.form.slugAuto' : 'categories.form.slugHint')}
        error={fieldMessage(t, errors.slug)}
      >
        <SlugInput
          value={form.slug}
          placeholder={isNew ? validators.toSlug(form.name) : undefined}
          onChange={set('slug')}
        />
      </FormField>
      <Checkbox
        id="brand-protect"
        label={t('brands.form.protectName')}
        description={t('brands.form.protectNameHint')}
        checked={form.protectName}
        onChange={check('protectName')}
      />
      <FormField label={t('brands.form.website')} error={fieldMessage(t, errors.website)}>
        <PlainTextInput
          type="url"
          inputMode="url"
          dir="ltr"
          maxLength={2048}
          placeholder="https://"
          value={form.website}
          onChange={set('website')}
        />
      </FormField>
      <FormField
        label={t('categories.form.description')}
        error={fieldMessage(t, errors.description)}
      >
        <PlainTextArea
          value={form.description}
          maxLength={BRAND.DESCRIPTION_MAX}
          onChange={set('description')}
        />
      </FormField>
      <ArabicPreview label={t('brands.form.descriptionArabic')} value={brand?.description} />
      <ImageField
        label={t('brands.form.logo')}
        value={form.logo}
        onChange={(logo) => setForm({ ...form, logo })}
        error={fieldMessage(t, errors.logoId)}
      />
      <Checkbox
        id="brand-active"
        label={t('categories.form.active')}
        checked={form.isActive}
        onChange={check('isActive')}
      />
      <fieldset className="grid gap-4 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t('categories.form.seo')}</legend>
        <FormField
          label={t('categories.form.seoTitle')}
          description={t('common.charCount', {
            count: form.seoTitle.length,
            max: BRAND.SEO_TITLE_MAX,
          })}
          error={fieldMessage(t, errors.seoTitle)}
        >
          <PlainTextInput
            value={form.seoTitle}
            maxLength={BRAND.SEO_TITLE_MAX}
            onChange={set('seoTitle')}
          />
        </FormField>
        <FormField
          label={t('categories.form.seoDescription')}
          description={t('common.charCount', {
            count: form.seoDescription.length,
            max: BRAND.SEO_DESCRIPTION_MAX,
          })}
          error={fieldMessage(t, errors.seoDescription)}
        >
          <PlainTextArea
            rows={3}
            value={form.seoDescription}
            maxLength={BRAND.SEO_DESCRIPTION_MAX}
            onChange={set('seoDescription')}
          />
        </FormField>
      </fieldset>
      <FormActions
        isNew={isNew}
        busy={create.isPending || update.isPending}
        confirmDelete={confirmDelete}
        onAskDelete={() => setConfirmDelete(true)}
        onDelete={() => remove.mutate(brand.id, { onSuccess: onDone })}
        deleting={remove.isPending}
        onCancel={onDone}
      />
    </form>
  );
}
