import { createContext, useContext, useId } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Label + control + help text + error, with accessible wiring done for you:
 * the control (any field component from this package) picks up `id`, `aria-invalid` and
 * `aria-describedby` from context.
 *
 *   <FormField label={t('auth.email')} error={fieldMessage(errors.email?.message)}>
 *     <EmailInput {...register('email')} />
 *   </FormField>
 *
 * `label`, `description` and `error` are ALREADY-TRANSLATED strings: this package is i18n-agnostic
 * (admin uses i18next, storefront uses its dictionaries); validation messages are i18n keys.
 */
const FieldContext = createContext(null);

/** Props a control should spread when inside a FormField (empty object outside one). */
export function useFieldControlProps() {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  const describedBy = [ctx.description && ctx.descriptionId, ctx.error && ctx.errorId]
    .filter(Boolean)
    .join(' ');
  return {
    id: ctx.id,
    'aria-invalid': ctx.error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    'aria-required': ctx.required || undefined,
  };
}

export function FormField({ label, description, error, required = false, className, children }) {
  const id = useId();
  const ctx = {
    id: `${id}-control`,
    descriptionId: `${id}-description`,
    errorId: `${id}-error`,
    description,
    error,
    required,
  };
  return (
    <FieldContext.Provider value={ctx}>
      <div className={cn('grid gap-2', className)}>
        {label && (
          <label htmlFor={ctx.id} className="text-sm leading-none font-medium select-none">
            {label}
            {required && (
              <span aria-hidden="true" className="ms-0.5 text-destructive">
                *
              </span>
            )}
          </label>
        )}
        {children}
        {description && (
          <p id={ctx.descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {error && (
          <p id={ctx.errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
