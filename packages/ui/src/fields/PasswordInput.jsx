import { useState } from 'react';
import { cn } from '../lib/cn.js';
import { SanitizedInput } from './SanitizedInput.jsx';

/**
 * Password with a show/hide toggle. Never sanitized (any character is valid); length bounded
 * (argon2 cost guard). `autoComplete`: 'current-password' for login, 'new-password' for sign-up.
 *
 * @param {object} props
 * @param {string} props.showLabel  translated "Show password"
 * @param {string} props.hideLabel  translated "Hide password"
 */
export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  autoComplete = 'current-password',
  ...props
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <SanitizedInput
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={128}
        dir="ltr"
        className={cn('pe-16', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  );
}
