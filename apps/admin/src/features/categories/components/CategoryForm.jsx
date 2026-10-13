import { CATEGORY, createCategorySchemas } from '@supershop/shared';
import { validators } from '@supershop/shared';
import { FormField, PlainTextArea, PlainTextInput, SlugInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicPreview } from '@/components/ArabicPreview';
import { ImageField } from '@/components/ImageField';
import { Button } from '@/components/ui/button';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';
import { useCreateCategory, useDeleteCategory, useMoveCategory, useUpdateCategory } from '../hooks';
import { childCount, parentOptions } from '../tree';

const schemas = createCategorySchemas();

const initialForm = (category, parentId) => ({
  name: category?.name?.en ?? '',
  slug: category?.slug ?? '',
  parentId: category ? (category.parentId ?? '') : (parentId ?? ''),
  description: category?.description?.en ?? '',
  isActive: category?.isActive ?? true,
  image: category?.image ?? null,
  seoTitle: category?.seo?.title?.en ?? '',
  seoDescription: category?.seo?.description?.en ?? '',
});

const FIELD_OF_PATH = { 'seo.title': 'seoTitle', 'seo.description': 'seoDescription' };
/** API/zod details `[{ path, message }]` → `{ field: message }` for the form. */
const detailsToErrors = (details = []) =>
  Object.fromEntries(
    details.map((d) => [FIELD_OF_PATH[d.path] ?? d.path.split('.')[0], d.message]),
  );

/**
 * Create/edit one category. Text is English only (Arabic is generated). Changing the parent moves
 * the category (with its subcategories) to the end of the new parent's list.
 * @param {{ category?: object, parentId?: string | null, list: object[], onSaved: (id: string) => void,
 *   onCancel: () => void, onDeleted: () => void }} props
 */
export function CategoryForm({ category, parentId, list, onSaved, onCancel, onDeleted }) {
  const { t } = useTranslation();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const move = useMoveCategory();
  const remove = useDeleteCategory();
  const [form, setForm] = useState(() => initialForm(category, parentId));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !category;
  const busy = create.isPending || update.isPending || move.isPending;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description,
      isActive: form.isActive,
      imageId: form.image?.id ?? null,
      seo: { title: form.seoTitle, description: form.seoDescription },
      ...(form.slug && { slug: form.slug }),
      ...(isNew && { parentId: form.parentId || null }),
    };
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body);
    if (!parsed.success) {
      setErrors(
        detailsToErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    try {
      if (isNew) {
        const created = await create.mutateAsync(parsed.data);
        onSaved(created.id);
        return;
      }
      await update.mutateAsync({ id: category.id, body: parsed.data });
      const newParent = form.parentId || null;
      if (newParent !== (category.parentId ?? null)) {
        await move.mutateAsync({
          id: category.id,
          parentId: newParent,
          index: childCount(list, newParent),
        });
      }
      onSaved(category.id);
    } catch (err) {
      setErrors(detailsToErrors(err?.details));
    }
  };

  const options = parentOptions(list, category?.id);

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <FormField label={t('categories.form.name')} error={fieldMessage(t, errors.name)} required>
        <PlainTextInput value={form.name} maxLength={CATEGORY.NAME_MAX} onChange={set('name')} />
      </FormField>
      <ArabicPreview label={t('categories.form.nameArabic')} value={category?.name} />

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

      <FormField label={t('categories.form.parent')} error={fieldMessage(t, errors.parentId)}>
        <Select value={form.parentId} onChange={set('parentId')}>
          <option value="">{t('categories.form.topLevel')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {`${'\u00a0'.repeat(o.depth * 3)}${o.label}`}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label={t('categories.form.description')}
        error={fieldMessage(t, errors.description)}
      >
        <PlainTextArea
          value={form.description}
          maxLength={CATEGORY.DESCRIPTION_MAX}
          onChange={set('description')}
        />
      </FormField>

      <ImageField
        label={t('categories.form.image')}
        value={form.image}
        onChange={(image) => setForm({ ...form, image })}
        error={fieldMessage(t, errors.imageId)}
      />

      <Checkbox
        id="category-active"
        label={t('categories.form.active')}
        description={t('categories.form.activeHint')}
        checked={form.isActive}
        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
      />

      <fieldset className="grid gap-4 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t('categories.form.seo')}</legend>
        <FormField
          label={t('categories.form.seoTitle')}
          description={t('common.charCount', {
            count: form.seoTitle.length,
            max: CATEGORY.SEO_TITLE_MAX,
          })}
          error={fieldMessage(t, errors.seoTitle)}
        >
          <PlainTextInput
            value={form.seoTitle}
            maxLength={CATEGORY.SEO_TITLE_MAX}
            onChange={set('seoTitle')}
          />
        </FormField>
        <FormField
          label={t('categories.form.seoDescription')}
          description={t('common.charCount', {
            count: form.seoDescription.length,
            max: CATEGORY.SEO_DESCRIPTION_MAX,
          })}
          error={fieldMessage(t, errors.seoDescription)}
        >
          <PlainTextArea
            rows={3}
            value={form.seoDescription}
            maxLength={CATEGORY.SEO_DESCRIPTION_MAX}
            onChange={set('seoDescription')}
          />
        </FormField>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {t(isNew ? 'categories.form.create' : 'common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        {!isNew &&
          (confirmDelete ? (
            <span className="ms-auto flex items-center gap-2">
              <span className="text-sm">{t('categories.form.confirmDelete')}</span>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(category.id, { onSuccess: onDeleted })}
              >
                {t('common.delete')}
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="ms-auto"
              onClick={() => setConfirmDelete(true)}
            >
              {t('common.delete')}
            </Button>
          ))}
      </div>
    </form>
  );
}
