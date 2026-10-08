import { validators } from '@supershop/shared';
import { useRef } from 'react';
import { cn } from '../lib/cn.js';
import { mergeRefs, setNativeValue } from '../lib/refs.js';
import { SanitizedInput } from './SanitizedInput.jsx';

/**
 * Quantity: positive whole numbers only (Arabic digits converted). Optional − / + steppers that
 * clamp to [min, max] and work with both controlled inputs and react-hook-form `register`.
 * `max` comes from settings (`cart.maxLineQty`); validate with `validators.quantity({ max })`.
 *
 * @param {object} props
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {boolean} [props.stepper]
 * @param {string} [props.decrementLabel]  translated aria-label for −
 * @param {string} [props.incrementLabel]  translated aria-label for +
 */
export function QtyInput({
  min = 1,
  max = 9999,
  stepper = false,
  decrementLabel = '−',
  incrementLabel = '+',
  className,
  disabled,
  ref,
  ...props
}) {
  const inner = useRef(null);
  const input = (
    <SanitizedInput
      ref={mergeRefs(inner, ref)}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={String(max).length}
      dir="ltr"
      sanitize={validators.sanitizeInteger}
      disabled={disabled}
      className={cn(stepper && 'w-16 text-center', className)}
      {...props}
    />
  );
  if (!stepper) return input;

  const step = (delta) => {
    const el = inner.current;
    if (!el) return;
    const current = Number.parseInt(el.value, 10);
    const base = Number.isNaN(current) ? min : current;
    setNativeValue(el, String(Math.min(max, Math.max(min, base + delta))));
    el.focus();
  };

  const btn =
    'inline-flex size-9 items-center justify-center rounded-md border border-input text-base disabled:opacity-50 hover:bg-muted';
  return (
    <div className="inline-flex items-center gap-1" dir="ltr">
      <button
        type="button"
        className={btn}
        aria-label={decrementLabel}
        disabled={disabled}
        onClick={() => step(-1)}
      >
        −
      </button>
      {input}
      <button
        type="button"
        className={btn}
        aria-label={incrementLabel}
        disabled={disabled}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
