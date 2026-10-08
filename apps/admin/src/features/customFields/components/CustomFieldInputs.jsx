import { FormField, PlainTextArea, PlainTextInput, SanitizedInput } from '@supershop/ui';
import { useTranslation } from 'react-i18next';
import { Checkbox, Select } from '@/features/settings/components/controls';
import { fieldMessage } from '@/lib/i18n';

/** Decimal numbers: digits, one '.', leading '-' (Arabic digits normalized by the schema). */
const sanitizeNumber = (v) =>
  String(v ?? '')
    .replace(/[^\d.\-\u0660-\u0669]/g, '')
    .replace(/(?!^)-/g, '')
    .replace(/(\..*)\./g, '$1');

/**
 * Renders inputs for active custom field definitions. Labels are the English source (admin UI is
 * English); values are data and never translated. Errors keyed `customFields.<key>`.
 */
export function CustomFieldInputs({ defs, values, onChange, errors, disabled }) {
  const { t } = useTranslation();
  const set = (key, value) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs
        .filter((d) => d.isActive)
        .map((d) => {
          const common = {
            label: d.label.en,
            description: d.helpText?.en || undefined,
            error: fieldMessage(t, errors[`customFields.${d.key}`]),
            required: d.required,
            className:
              d.type === 'textarea' || d.type === 'multiselect' ? 'sm:col-span-2' : undefined,
          };
          const value = values[d.key];
          const placeholder = d.placeholder?.en || undefined;
          switch (d.type) {
            case 'textarea':
              return (
                <FormField key={d.key} {...common}>
                  <PlainTextArea
                    value={value ?? ''}
                    placeholder={placeholder}
                    maxLength={d.max ?? 5000}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.value)}
                  />
                </FormField>
              );
            case 'number':
              return (
                <FormField key={d.key} {...common}>
                  <SanitizedInput
                    inputMode="decimal"
                    dir="ltr"
                    sanitize={sanitizeNumber}
                    value={value ?? ''}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.value)}
                  />
                </FormField>
              );
            case 'boolean':
              return (
                <div key={d.key} className="self-end">
                  <Checkbox
                    id={`cf-${d.key}`}
                    label={d.label.en}
                    description={common.description}
                    checked={Boolean(value)}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.checked)}
                  />
                </div>
              );
            case 'select':
              return (
                <FormField key={d.key} {...common}>
                  <Select
                    value={value ?? ''}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.value)}
                  >
                    <option value="">{t('customFields.none')}</option>
                    {d.options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label.en}
                      </option>
                    ))}
                  </Select>
                </FormField>
              );
            case 'multiselect': {
              const list = Array.isArray(value) ? value : [];
              return (
                <fieldset key={d.key} className="grid gap-1 sm:col-span-2" disabled={disabled}>
                  <legend className="mb-1 text-sm font-medium">{d.label.en}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {d.options.map((o) => (
                      <label key={o.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={list.includes(o.key)}
                          onChange={(e) =>
                            set(
                              d.key,
                              e.target.checked ? [...list, o.key] : list.filter((k) => k !== o.key),
                            )
                          }
                        />
                        {o.label.en}
                      </label>
                    ))}
                  </div>
                  {common.error && <p className="text-sm text-destructive">{common.error}</p>}
                </fieldset>
              );
            }
            case 'date':
              return (
                <FormField key={d.key} {...common}>
                  <SanitizedInput
                    type="date"
                    dir="ltr"
                    value={value ?? ''}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.value)}
                  />
                </FormField>
              );
            default:
              return (
                <FormField key={d.key} {...common}>
                  <PlainTextInput
                    value={value ?? ''}
                    placeholder={placeholder}
                    maxLength={d.max ?? 500}
                    disabled={disabled}
                    onChange={(e) => set(d.key, e.target.value)}
                  />
                </FormField>
              );
          }
        })}
    </div>
  );
}
