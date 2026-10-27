import { createProductSchemas, PERMISSIONS as P, PRODUCT } from '@supershop/shared';
import { validators } from '@supershop/shared';
import { FormField, MoneyInput, PlainTextArea, PlainTextInput, SlugInput } from '@supershop/ui';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { ArabicPreview } from '@/components/ArabicPreview';
import { TagInput } from '@/components/TagInput';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { brands } from '@/features/brands/resource';
import { CategoryChecklist } from '@/features/categories/components/CategoryChecklist';
import { CustomFieldInputs } from '@/features/customFields/components/CustomFieldInputs';
import { useFieldDefinitions } from '@/features/customFields/resource';
import { Select } from '@/features/settings/components/controls';
import { suppliers } from '@/features/suppliers/resource';
import { errorMessage, fieldMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { issuesToDetails } from '@/lib/resource';
import { EditorSection } from '../components/EditorSection';
import { GalleryEditor } from '../components/GalleryEditor';
import { OptionsEditor } from '../components/OptionsEditor';
import { VariantTable } from '../components/VariantTable';
import { syncVariants, toForm, toPayload } from '../form';
import { products, useGenerateBarcodes, useProduct } from '../resource';
import { STATUS_TONE } from '../status';

const schemas = createProductSchemas();
/** Full dotted paths are kept for nested fields (variants.2.sku, customFields.x, options.0.name). */
const toErrors = (details = []) => Object.fromEntries(details.map((d) => [d.path, d.message]));

/** The fields a person would recognise, from the paths the schema uses. */
const FIELD_LABELS = {
  name: 'products.form.name',
  slug: 'categories.form.slug',
  shortDescription: 'products.form.shortDescription',
  description: 'products.form.description',
  status: 'products.form.status',
  taxCategory: 'products.form.taxCategory',
  categoryIds: 'products.form.categories',
  brandId: 'products.form.brand',
  supplierId: 'products.form.supplier',
  tags: 'products.form.tags',
  imageIds: 'products.sections.gallery',
  variants: 'products.sections.variants',
  options: 'products.sections.options',
  'seo.title': 'categories.form.seoTitle',
  'seo.description': 'categories.form.seoDescription',
};

/** What this product costs, as the sidebar puts it: one price, or the range its variants cover. */
const priceLabel = (t, form) => {
  const prices = form.variants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  // Nothing priced yet, but a default was typed: show what the variants are about to cost.
  if (!prices.length) {
    const fallback = Number(form.defaultPrice);
    if (!Number.isFinite(fallback) || fallback <= 0) return t('products.summary.noPrice');
    prices.push(fallback);
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const money = (n) => `SAR ${n.toFixed(2)}`;
  return low === high ? money(low) : `${money(low)} – ${money(high)}`;
};

/** "Product name, Variants" — what to go and look at, named rather than counted. */
const fieldList = (t, errors) => {
  const names = Object.keys(errors).map((path) => {
    const key = FIELD_LABELS[path] ?? FIELD_LABELS[path.split('.')[0]];
    // A row or a value inside a section: name the section, the field itself is marked in place.
    return key ? t(key, { count: 0 }) : path.split('.')[0];
  });
  return [...new Set(names)].join(' · ');
};

/** `/products/new` and `/products/:id`. */
export function ProductEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: product, isPending, isError, error } = useProduct(id);
  if (id && isPending) return <Skeleton className="h-96" />;
  if (id && isError) return <Alert variant="destructive">{errorMessage(t, error)}</Alert>;
  // Re-mount the form when the saved product changes (fresh state after save).
  return (
    <ProductForm key={product ? `${product.id}:${product.updatedAt}` : 'new'} product={product} />
  );
}

function ProductForm({ product }) {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const isNew = !product;
  const canEdit = can(isNew ? P.PRODUCT_CREATE : P.PRODUCT_UPDATE);
  const canViewCost = can(P.PRODUCT_VIEW_COST);
  const canSeeSuppliers = [P.SUPPLIER_MANAGE, P.PURCHASE_VIEW, P.PURCHASE_MANAGE].some(can);
  const create = products.useCreate();
  const update = products.useUpdate();
  const remove = products.useRemove();
  const { data: defs = [] } = useFieldDefinitions('product');
  const generateBarcodes = useGenerateBarcodes();
  const brandList = brands.useList({ page: 1, limit: 100, sort: 'name' }).data?.data ?? [];
  const supplierList =
    suppliers.useList({ page: 1, limit: 100, sort: 'name' }, { enabled: canSeeSuppliers }).data
      ?.data ?? [];

  const [form, setForm] = useState(() => toForm(product));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = create.isPending || update.isPending;

  const patch = (next) => {
    setForm((f) => ({ ...f, ...next }));
    setDirty(true);
  };
  const set = (key) => (e) => patch({ [key]: e.target.value });
  const err = (path) => fieldMessage(t, errors[path]);
  /** Options changed structurally → rebuild the variant rows (existing rows are kept). */
  const commitOptions = (options) => {
    setForm((f) => ({ ...f, ...syncVariants({ ...f, options }) }));
    setDirty(true);
  };

  // Leaving with unsaved changes: browser tab close + in-app navigation.
  const leaving = useRef(false); // set right before our own navigation after save/delete
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = async (e) => {
    e.preventDefault();
    const body = toPayload(form, { canViewCost, defs });
    const parsed = (isNew ? schemas.create : schemas.update).safeParse(body);
    if (!parsed.success) {
      setErrors(toErrors(issuesToDetails(parsed.error.issues)));
      return;
    }
    setErrors({});
    try {
      const saved = isNew
        ? await create.mutateAsync(parsed.data)
        : await update.mutateAsync({ id: product.id, body: parsed.data });
      setDirty(false);
      if (isNew) {
        leaving.current = true;
        navigate(`/products/${saved.id}`, { replace: true });
      }
    } catch (error) {
      setErrors(toErrors(error?.details));
    }
  };
  const errorCount = Object.keys(errors).length;
  const hasCustomValues = Object.values(form.customFields ?? {}).some(
    (v) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0),
  );

  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      {/*
        The bar stays put: a product is a long page, and the way out of it (Save) should not be
        somewhere above the fold. It also carries the state of the form — what this is, whether it
        is published, and whether there is anything unsaved.
      */}
      <header className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="grid min-w-0 gap-1">
          <Link
            to="/products"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t('products.title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <span className="truncate">
              {isNew ? form.name.trim() || t('products.newTitle') : product.name.en}
            </span>
            {!isNew && (
              <Badge tone={STATUS_TONE[product.status]}>
                {t(`products.status.${product.status}`)}
              </Badge>
            )}
            {dirty && <Badge tone="warn">{t('products.unsavedBadge')}</Badge>}
          </h1>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('products.saving') : t(isNew ? 'products.create' : 'common.save')}
            </Button>
          </div>
        )}
      </header>

      {errorCount > 0 && (
        <Alert variant="destructive">
          <span className="block font-medium">
            {t('products.fixErrors', { count: errorCount })}
          </span>
          {/* Which ones: a count alone leaves the person hunting down a long page. */}
          <span className="block text-sm">{fieldList(t, errors)}</span>
        </Alert>
      )}
      {!canEdit && <Alert>{t('products.readOnly')}</Alert>}

      <fieldset disabled={!canEdit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <EditorSection
            step={1}
            title={t('products.sections.basics')}
            description={t('products.sections.basicsHint')}
          >
            <FormField label={t('products.form.name')} error={err('name')} required>
              <PlainTextInput
                value={form.name}
                maxLength={PRODUCT.NAME_MAX}
                onChange={set('name')}
              />
            </FormField>
            <ArabicPreview label={t('products.form.nameArabic')} value={product?.name} />
            <FormField
              label={t('categories.form.slug')}
              description={t(isNew ? 'categories.form.slugAuto' : 'categories.form.slugHint')}
              error={err('slug')}
            >
              <SlugInput
                value={form.slug}
                placeholder={isNew ? validators.toSlug(form.name) : undefined}
                onChange={set('slug')}
              />
            </FormField>
            <FormField label={t('products.form.shortDescription')} error={err('shortDescription')}>
              <PlainTextArea
                rows={2}
                value={form.shortDescription}
                maxLength={PRODUCT.SHORT_DESCRIPTION_MAX}
                onChange={set('shortDescription')}
              />
            </FormField>
            <FormField label={t('products.form.description')} error={err('description')}>
              <PlainTextArea
                rows={8}
                value={form.description}
                maxLength={PRODUCT.DESCRIPTION_MAX}
                onChange={set('description')}
              />
            </FormField>
          </EditorSection>

          <EditorSection
            step={2}
            title={t('products.sections.gallery')}
            description={t('products.gallery.description')}
          >
            <GalleryEditor
              value={form.images}
              max={PRODUCT.MAX_IMAGES}
              disabled={!canEdit}
              onChange={(images) => {
                const ids = new Set(images.map((i) => i.id));
                // Variant images must stay a subset of the gallery.
                patch({
                  images,
                  variants: form.variants.map((v) => ({
                    ...v,
                    imageIds: v.imageIds.filter((x) => ids.has(x)),
                  })),
                });
              }}
            />
            {err('imageIds') && <p className="text-sm text-destructive">{err('imageIds')}</p>}
          </EditorSection>

          <EditorSection
            step={3}
            title={t('products.sections.options')}
            description={t('products.options.description')}
          >
            {canEdit && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('products.variants.skuPrefix')}
                  description={t('products.variants.skuPrefixHint')}
                >
                  <PlainTextInput
                    value={form.skuPrefix}
                    maxLength={24}
                    dir="ltr"
                    onChange={set('skuPrefix')}
                  />
                </FormField>
                <FormField
                  label={t('products.variants.defaultPrice')}
                  description={t('products.variants.defaultPriceHint')}
                >
                  <MoneyInput
                    currency="SAR"
                    value={form.defaultPrice}
                    onChange={set('defaultPrice')}
                  />
                </FormField>
              </div>
            )}
            <OptionsEditor
              options={form.options}
              errors={errors}
              disabled={!canEdit}
              onChange={(options) => patch({ options })}
              onCommit={commitOptions}
            />
          </EditorSection>

          <EditorSection
            step={4}
            title={t('products.sections.variants', { count: form.variants.length })}
            description={t('products.variants.description')}
          >
            {err('variants') && <p className="text-sm text-destructive">{err('variants')}</p>}
            <VariantTable
              variants={form.variants}
              options={form.options}
              gallery={form.images}
              errors={errors}
              canViewCost={canViewCost}
              disabled={!canEdit}
              currency="SAR"
              productName={form.name}
              onGenerateBarcodes={canEdit ? generateBarcodes : undefined}
              onChange={(variants) => patch({ variants })}
            />
          </EditorSection>

          {defs.some((d) => d.isActive) && (
            <EditorSection
              step={5}
              title={t('products.sections.customFields')}
              description={t('products.sections.customFieldsHint')}
              collapsible
              defaultOpen={
                hasCustomValues || Object.keys(errors).some((k) => k.startsWith('customFields'))
              }
            >
              <CustomFieldInputs
                defs={defs}
                values={form.customFields}
                errors={errors}
                disabled={!canEdit}
                onChange={(customFields) => patch({ customFields })}
              />
            </EditorSection>
          )}

          <EditorSection
            step={defs.some((d) => d.isActive) ? 6 : 5}
            title={t('categories.form.seo')}
            description={t('products.sections.seoHint')}
            collapsible
            defaultOpen={Boolean(
              form.seoTitle || form.seoDescription || err('seo.title') || err('seo.description'),
            )}
          >
            <FormField
              label={t('categories.form.seoTitle')}
              description={t('common.charCount', {
                count: form.seoTitle.length,
                max: PRODUCT.SEO_TITLE_MAX,
              })}
              error={err('seo.title')}
            >
              <PlainTextInput
                value={form.seoTitle}
                maxLength={PRODUCT.SEO_TITLE_MAX}
                onChange={set('seoTitle')}
              />
            </FormField>
            <FormField
              label={t('categories.form.seoDescription')}
              description={t('common.charCount', {
                count: form.seoDescription.length,
                max: PRODUCT.SEO_DESCRIPTION_MAX,
              })}
              error={err('seo.description')}
            >
              <PlainTextArea
                rows={3}
                value={form.seoDescription}
                maxLength={PRODUCT.SEO_DESCRIPTION_MAX}
                onChange={set('seoDescription')}
              />
            </FormField>
          </EditorSection>
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-32">
          {/*
            What is being built, as the shop will see it: the first picture, the name, what it
            costs and how many ways it comes. It is the one place on this page that answers
            "is this right?" without reading every field.
          */}
          <Card>
            <CardContent className="grid gap-3 pt-0">
              <div className="flex items-center gap-3">
                {form.images[0]?.url ? (
                  <img
                    src={form.images[0].url}
                    alt=""
                    className="size-14 shrink-0 rounded border object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded border border-dashed text-muted-foreground">
                    <ImageIcon className="size-5" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {form.name.trim() || t('products.summary.noName')}
                  </p>
                  <p className="text-sm text-muted-foreground">{priceLabel(t, form)}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('products.summary.variants')}</dt>
                  <dd className="font-medium tabular-nums">{form.variants.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('products.summary.images')}</dt>
                  <dd className="font-medium tabular-nums">{form.images.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('products.form.categories')}</dt>
                  <dd className="font-medium tabular-nums">{form.categoryIds.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('products.form.status')}</dt>
                  <dd className="font-medium">{t(`products.status.${form.status}`)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('products.sections.publishing')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField
                label={t('products.form.status')}
                description={t('products.form.statusHint')}
                error={err('status')}
              >
                <Select value={form.status} onChange={set('status')}>
                  {PRODUCT.STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`products.status.${s}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('products.form.taxCategory')} error={err('taxCategory')}>
                <Select value={form.taxCategory} onChange={set('taxCategory')}>
                  {PRODUCT.TAX_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`products.tax.${c}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('products.sections.organization')}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <span className="text-sm font-medium">{t('products.form.categories')}</span>
                <CategoryChecklist
                  label={t('products.form.categories')}
                  value={form.categoryIds}
                  max={PRODUCT.MAX_CATEGORIES}
                  onChange={(categoryIds) => patch({ categoryIds })}
                />
                {err('categoryIds') && (
                  <p className="text-sm text-destructive">{err('categoryIds')}</p>
                )}
              </div>
              <FormField label={t('products.form.brand')} error={err('brandId')}>
                <Select value={form.brandId} onChange={set('brandId')}>
                  <option value="">{t('customFields.none')}</option>
                  {brandList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              {canSeeSuppliers && (
                <FormField label={t('products.form.supplier')} error={err('supplierId')}>
                  <Select value={form.supplierId} onChange={set('supplierId')}>
                    <option value="">{t('customFields.none')}</option>
                    {supplierList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField
                label={t('products.form.tags')}
                description={t('products.form.tagsHint')}
                error={err('tags')}
              >
                <TagInput
                  value={form.tags}
                  max={PRODUCT.MAX_TAGS}
                  lowercase
                  removeLabel={(tag) => t('products.form.removeTag', { tag })}
                  onChange={(tags) => patch({ tags })}
                />
              </FormField>
            </CardContent>
          </Card>

          {!isNew && can(P.PRODUCT_DELETE) && (
            <Card>
              <CardContent className="grid gap-2">
                {confirmDelete ? (
                  <>
                    <span className="text-sm">{t('products.confirmDelete')}</span>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(product.id, {
                          onSuccess: () => {
                            leaving.current = true;
                            navigate('/products');
                          },
                        })
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
                    {t('products.delete')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </fieldset>

      {blocker.state === 'blocked' && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="grid w-full max-w-sm gap-4 rounded-lg bg-background p-6 shadow-lg">
            <h2 id="unsaved-title" className="text-lg font-semibold">
              {t('products.unsaved.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('products.unsaved.body')}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => blocker.reset()}>
                {t('products.unsaved.stay')}
              </Button>
              <Button type="button" variant="destructive" onClick={() => blocker.proceed()}>
                {t('products.unsaved.leave')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
