import { validators } from '@supershop/shared';
import { SanitizedInput } from '../fields/SanitizedInput.jsx';
import { charFromKeyEvent, isEnter } from './keys.js';

/** Inserts text at the caret the way typing would, so React's onChange runs (controlled inputs). */
function insertAtCaret(input, text) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  setter.call(input, input.value.slice(0, start) + text + input.value.slice(end));
  input.setSelectionRange(start + text.length, start + text.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Barcode/SKU field that works with keyboard-wedge scanners: physical keys are read regardless of
 * the keyboard layout (Arabic layout safe), and Enter calls `onScan(value)` instead of submitting
 * the surrounding form (scan → next field). Typing by hand works the same way.
 * @param {{ onScan?: (value: string, input: HTMLInputElement) => void } & import('react').InputHTMLAttributes<HTMLInputElement>} props
 */
export function BarcodeInput({ onScan, onKeyDown, ...props }) {
  return (
    <SanitizedInput
      type="text"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={64}
      dir="ltr"
      sanitize={validators.sanitizeCode}
      {...props}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        if (isEnter(e)) {
          e.preventDefault();
          onScan?.(e.currentTarget.value, e.currentTarget);
          return;
        }
        const ch = charFromKeyEvent(e);
        // The layout produced something else for this physical key (e.g. an Arabic letter).
        if (ch && e.key.length === 1 && validators.sanitizeCode(e.key) !== ch) {
          e.preventDefault();
          insertAtCaret(e.currentTarget, ch);
        }
      }}
    />
  );
}
