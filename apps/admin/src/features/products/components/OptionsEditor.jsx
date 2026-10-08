import { PRODUCT } from '@supershop/shared';
import { FormField, PlainTextInput } from '@supershop/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';

const DEFAULT_SWATCH = '#cccccc';

/** Stable React key for options added in this session (their `key` is assigned later). */
let uidSeq = 0;
const nextUid = () => `option-${(uidSeq += 1)}`;

/**
 * Options (e.g. Color, Size) and their values. Typing updates the state (`onChange`); structural
 * changes and leaving a field `onCommit` so the variant matrix is rebuilt only with finished text
 * (keys are derived from the English text the first time an option is complete).
 */
export function OptionsEditor({ options, onChange, onCommit, errors, disabled }) {
  const { t } = useTranslation();
  const update = (i, patch, commit = false) => {
    const next = options.map((o, j) => (j === i ? { ...o, ...patch } : o));
    (commit ? onCommit : onChange)(next);
  };

  return (
    <div className="grid gap-4">
      {options.map((o, i) => (
        <OptionCard
          key={o.uid ?? o.key ?? i}
          index={i}
          option={o}
          errors={errors}
          disabled={disabled}
          onUpdate={(patch, commit) => update(i, patch, commit)}
          onCommitAll={() => onCommit(options)}
          onRemove={() => onCommit(options.filter((_, j) => j !== i))}
        />
      ))}
      {!disabled && options.length < PRODUCT.MAX_OPTIONS && (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange([...options, { uid: nextUid(), name: '', values: [], showSwatches: false }])
            }
          >
            <Plus className="size-4" aria-hidden />
            {t('products.options.add')}
          </Button>
        </div>
      )}
      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('products.options.none')}</p>
      )}
    </div>
  );
}

function OptionCard({ index, option, errors, disabled, onUpdate, onCommitAll, onRemove }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const showSwatches = option.showSwatches ?? option.values.some((v) => v.swatch);
  const setValue = (j, patch, commit) =>
    onUpdate({ values: option.values.map((v, k) => (k === j ? { ...v, ...patch } : v)) }, commit);
  const addValue = () => {
    const label = draft.trim();
    setDraft('');
    if (!label || option.values.length >= PRODUCT.MAX_OPTION_VALUES) return;
    if (option.values.some((v) => v.label.toLowerCase() === label.toLowerCase())) return;
    onUpdate(
      { values: [...option.values, { label, swatch: showSwatches ? DEFAULT_SWATCH : '' }] },
      true,
    );
  };
  const err = (path) => fieldMessage(t, errors[`options.${index}.${path}`]);

  return (
    <fieldset className="grid gap-3 rounded-md border p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">
        {t('products.options.option', { n: index + 1 })}
      </legend>
      <div className="flex items-end gap-2">
        <FormField
          label={t('products.options.name')}
          error={err('name') ?? err('key')}
          className="flex-1"
        >
          <PlainTextInput
            value={option.name}
            maxLength={40}
            placeholder={t('products.options.namePlaceholder')}
            onChange={(e) => onUpdate({ name: e.target.value })}
            onBlur={onCommitAll}
          />
        </FormField>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {t('products.options.remove')}
        </Button>
      </div>
      <Checkbox
        id={`swatches-${index}`}
        label={t('products.options.swatches')}
        checked={showSwatches}
        onChange={(e) =>
          onUpdate(
            {
              showSwatches: e.target.checked,
              // What the colour picker shows is what gets saved.
              values: option.values.map((v) => ({
                ...v,
                swatch: e.target.checked ? v.swatch || DEFAULT_SWATCH : '',
              })),
            },
            true,
          )
        }
      />
      <ul className="grid gap-2">
        {option.values.map((v, j) => (
          <li key={v.key ?? `v-${j}`} className="flex items-center gap-2">
            {showSwatches && (
              <input
                type="color"
                className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
                aria-label={t('products.options.swatchFor', { value: v.label })}
                value={v.swatch || DEFAULT_SWATCH}
                onChange={(e) => setValue(j, { swatch: e.target.value })}
                onBlur={onCommitAll}
              />
            )}
            <PlainTextInput
              value={v.label}
              maxLength={60}
              aria-label={t('products.options.valueLabel', { n: j + 1 })}
              aria-invalid={
                errors[`options.${index}.values.${j}.label`] ||
                errors[`options.${index}.values.${j}.key`]
                  ? true
                  : undefined
              }
              onChange={(e) => setValue(j, { label: e.target.value })}
              onBlur={onCommitAll}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('products.options.removeValue', { value: v.label })}
              onClick={() => onUpdate({ values: option.values.filter((_, k) => k !== j) }, true)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <PlainTextInput
        value={draft}
        maxLength={60}
        aria-label={t('products.options.addValue')}
        placeholder={t('products.options.addValuePlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addValue();
          }
        }}
        onBlur={addValue}
      />
      {err('values') && <p className="text-sm text-destructive">{err('values')}</p>}
    </fieldset>
  );
}
