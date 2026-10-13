import { STOCK } from '@supershop/shared';
import { FormField, IntegerInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VariantLabel } from '@/components/VariantPicker';
import { Checkbox } from '@/features/settings/components/controls';
import { useSetThreshold } from '../resource';

/** Low-stock level for one item in one branch, or the store default. */
export function ThresholdDialog({ level, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(level)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} aria-describedby={undefined}>
        <DialogTitle className="pe-8">{t('inventory.threshold.title')}</DialogTitle>
        {level && <ThresholdForm level={level} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ThresholdForm({ level, onDone }) {
  const { t } = useTranslation();
  const save = useSetThreshold();
  const [useDefault, setUseDefault] = useState(level.lowStockThreshold == null);
  const [value, setValue] = useState(String(level.lowStockThreshold ?? level.threshold));
  const invalid = !useDefault && (value === '' || Number(value) > STOCK.MAX_QTY);

  const submit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    await save.mutateAsync({
      branchId: level.branch.id,
      variantId: level.variant.id,
      lowStockThreshold: useDefault ? null : Number(value),
    });
    onDone();
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-1">
        <VariantLabel variant={level.variant} />
        <span className="text-sm text-muted-foreground">
          {level.branch.code} · {level.branch.name.en}
        </span>
      </div>
      <Checkbox
        id="threshold-default"
        label={t('inventory.threshold.useDefault')}
        description={t('inventory.threshold.useDefaultHint')}
        checked={useDefault}
        onChange={(e) => setUseDefault(e.target.checked)}
      />
      {!useDefault && (
        <FormField
          label={t('inventory.threshold.level')}
          description={t('inventory.threshold.levelHint')}
          error={invalid ? t('validation.quantity.invalid') : undefined}
        >
          <IntegerInput maxLength={7} value={value} onChange={(e) => setValue(e.target.value)} />
        </FormField>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
