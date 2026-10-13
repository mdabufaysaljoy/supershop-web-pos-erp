'use client';

import { FormField, PlainTextArea, PlainTextInput, useFieldControlProps } from '@supershop/ui';
import { useT } from '@/i18n/I18nProvider';
import { fieldError } from '@/lib/fieldError';

/** Native select wired to its FormField label (id, aria-invalid, described-by). */
function FieldSelect({ children, ...props }) {
  return (
    <select
      {...useFieldControlProps()}
      {...props}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

/**
 * Admin-defined checkout fields (labels/help translated server-side; what the shopper types is
 * data and is never translated). One renderer per field type.
 */
export function CustomFields({ fields, values, errors, onChange }) {
  const t = useT();
  if (!fields.length) return null;
  return (
    <div className="grid gap-4">
      {fields.map((f) => {
        const value = values[f.key] ?? '';
        const set = (v) => onChange({ ...values, [f.key]: v });
        const error = fieldError(t, errors[`customFields.${f.key}`]);
        const common = {
          label: f.label,
          description: f.helpText || undefined,
          error,
          required: f.required,
        };
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={Boolean(value)}
                onChange={(e) => set(e.target.checked)}
              />
              <span>
                <span className="font-medium">{f.label}</span>
                {f.helpText && <span className="block text-muted-foreground">{f.helpText}</span>}
                {error && <span className="block text-destructive">{error}</span>}
              </span>
            </label>
          );
        }
        if (f.type === 'multiselect') {
          const chosen = Array.isArray(value) ? value : [];
          return (
            <fieldset key={f.key} className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                {f.label}
                {f.required && (
                  <span aria-hidden className="ms-0.5 text-destructive">
                    *
                  </span>
                )}
              </legend>
              {f.helpText && <p className="text-sm text-muted-foreground">{f.helpText}</p>}
              {f.options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={chosen.includes(o.key)}
                    onChange={(e) =>
                      set(e.target.checked ? [...chosen, o.key] : chosen.filter((k) => k !== o.key))
                    }
                  />
                  {o.label}
                </label>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </fieldset>
          );
        }
        return (
          <FormField key={f.key} {...common}>
            {f.type === 'textarea' ? (
              <PlainTextArea
                rows={3}
                maxLength={f.max ?? 2000}
                placeholder={f.placeholder || undefined}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            ) : f.type === 'select' ? (
              <FieldSelect value={value} onChange={(e) => set(e.target.value)}>
                <option value="">{f.placeholder || t('checkout.choose')}</option>
                {f.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </FieldSelect>
            ) : (
              <PlainTextInput
                type={f.type === 'number' ? 'text' : f.type === 'date' ? 'date' : 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                maxLength={f.type === 'text' ? (f.max ?? 500) : undefined}
                placeholder={f.placeholder || undefined}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </FormField>
        );
      })}
    </div>
  );
}
