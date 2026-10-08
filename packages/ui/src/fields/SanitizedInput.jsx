import { useFieldControlProps } from '../form/FormField.jsx';
import { cn } from '../lib/cn.js';
import { applySanitizer, blockInvalidInsertion } from './sanitizeInput.js';
import { inputClass } from './styles.js';

/**
 * Base for every field component: an <input> that filters keystrokes/paste with `sanitize`.
 * Works uncontrolled (react-hook-form `register`) and controlled (`value` + `onChange`): the
 * sanitized value is written to the element BEFORE `onChange` runs, so handlers only ever see
 * clean values. React 19: `ref` is a normal prop and is forwarded.
 *
 * @param {object} props
 * @param {(v: string) => string} [props.sanitize]
 */
export function SanitizedInput({ sanitize, onChange, onBeforeInput, className, ref, ...props }) {
  const field = useFieldControlProps();
  return (
    <input
      ref={ref}
      data-slot="input"
      {...field}
      {...props}
      className={cn(inputClass, className)}
      onBeforeInput={(e) => {
        if (sanitize) blockInvalidInsertion(e, sanitize);
        onBeforeInput?.(e);
      }}
      onChange={(e) => {
        if (sanitize) applySanitizer(e.target, sanitize);
        onChange?.(e);
      }}
    />
  );
}
