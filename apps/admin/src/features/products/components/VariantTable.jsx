import { CodeInput, IntegerInput, MoneyInput } from '@supershop/ui';
import { Images } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fieldMessage } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { comboLabel } from '../form';

/**
 * One row per sellable variant. Turning a combination off (Active) hides it from the storefront
 * without deleting its history. Money in major units ("49.00").
 */
export function VariantTable({
  variants,
  options,
  gallery,
  onChange,
  errors,
  canViewCost,
  disabled,
  currency,
}) {
  const { t } = useTranslation();
  const [bulkPrice, setBulkPrice] = useState('');
  const [imagesFor, setImagesFor] = useState(null); // row index
  const set = (i, patch) => onChange(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const err = (i, field) => errors[`variants.${i}.${field}`];

  const cell = (i, field, Input, props = {}) => {
    const message = fieldMessage(t, err(i, field));
    return (
      <div className="grid min-w-28 gap-1">
        <Input
          value={variants[i][field]}
          aria-label={t(`products.variants.${field}For`, { variant: rowLabel(i) })}
          aria-invalid={message ? true : undefined}
          disabled={disabled}
          onChange={(e) => set(i, { [field]: e.target.value })}
          {...props}
        />
        {message && <span className="text-xs whitespace-normal text-destructive">{message}</span>}
      </div>
    );
  };
  const rowLabel = (i) =>
    comboLabel(variants[i].optionValues, options) || t('products.variants.default');

  return (
    <div className="grid gap-3">
      {!disabled && variants.length > 1 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <MoneyInput
              currency={currency}
              value={bulkPrice}
              aria-label={t('products.variants.bulkPrice')}
              placeholder={t('products.variants.bulkPrice')}
              onChange={(e) => setBulkPrice(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!bulkPrice}
            onClick={() => onChange(variants.map((v) => ({ ...v, price: bulkPrice })))}
          >
            {t('products.variants.applyToAll')}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('products.variants.variant')}</TableHead>
            <TableHead>{t('products.variants.sku')}</TableHead>
            <TableHead>{t('products.variants.barcode')}</TableHead>
            <TableHead>{t('products.variants.price')}</TableHead>
            <TableHead>{t('products.variants.compareAtPrice')}</TableHead>
            {canViewCost && <TableHead>{t('products.variants.cost')}</TableHead>}
            <TableHead>{t('products.variants.weightGrams')}</TableHead>
            <TableHead>{t('products.variants.images')}</TableHead>
            <TableHead>{t('products.variants.active')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((v, i) => (
            <TableRow
              key={v.id ?? `new:${JSON.stringify(v.optionValues)}`}
              className={cn(!v.isActive && 'opacity-60')}
            >
              <TableCell className="font-medium">
                {rowLabel(i)}
                {fieldMessage(t, err(i, 'optionValues')) && (
                  <span className="block text-xs text-destructive">
                    {fieldMessage(t, err(i, 'optionValues'))}
                  </span>
                )}
              </TableCell>
              <TableCell>{cell(i, 'sku', CodeInput)}</TableCell>
              <TableCell>{cell(i, 'barcode', CodeInput)}</TableCell>
              <TableCell>{cell(i, 'price', MoneyInput)}</TableCell>
              <TableCell>{cell(i, 'compareAtPrice', MoneyInput)}</TableCell>
              {canViewCost && <TableCell>{cell(i, 'cost', MoneyInput)}</TableCell>}
              <TableCell>{cell(i, 'weightGrams', IntegerInput, { maxLength: 7 })}</TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || gallery.length === 0}
                  aria-label={t('products.variants.imagesFor', {
                    variant: rowLabel(i),
                    count: v.imageIds.length,
                  })}
                  aria-invalid={err(i, 'imageIds') ? true : undefined}
                  onClick={() => setImagesFor(i)}
                >
                  <Images className="size-4" aria-hidden />
                  {v.imageIds.length}
                </Button>
              </TableCell>
              <TableCell>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={v.isActive}
                  disabled={disabled}
                  aria-label={t('products.variants.activeFor', { variant: rowLabel(i) })}
                  onChange={(e) => set(i, { isActive: e.target.checked })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={imagesFor != null} onOpenChange={(open) => !open && setImagesFor(null)}>
        <DialogContent closeLabel={t('common.close')}>
          {imagesFor != null && (
            <>
              <div className="grid gap-1 pe-8">
                <DialogTitle>
                  {t('products.variants.imagesTitle', { variant: rowLabel(imagesFor) })}
                </DialogTitle>
                <DialogDescription>{t('products.variants.imagesHint')}</DialogDescription>
              </div>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {gallery.map((img) => {
                  const chosen = variants[imagesFor].imageIds.includes(img.id);
                  return (
                    <li key={img.id}>
                      <button
                        type="button"
                        aria-pressed={chosen}
                        className={cn(
                          'aspect-square w-full rounded-lg border bg-muted p-1',
                          chosen && 'border-primary ring-2 ring-primary',
                        )}
                        onClick={() => {
                          const ids = variants[imagesFor].imageIds;
                          set(imagesFor, {
                            imageIds: chosen
                              ? ids.filter((x) => x !== img.id)
                              : [...ids, img.id].slice(0, 10),
                          });
                        }}
                      >
                        <img src={img.thumbUrl} alt="" className="size-full object-contain" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end">
                <Button type="button" onClick={() => setImagesFor(null)}>
                  {t('common.done')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
