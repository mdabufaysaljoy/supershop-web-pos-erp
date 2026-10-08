import { validators } from '@supershop/shared';
import { SanitizedInput } from './SanitizedInput.jsx';

/**
 * Typed field components (CLAUDE.md §5.3). Each pairs a keystroke sanitizer with the right
 * keyboard/autofill hints. Validate with the matching @supershop/shared schema in the form
 * (same schema the API uses): email → validators.email, phone → validators.phone(), etc.
 *
 * Numeric/identifier fields are `dir="ltr"` so digits, +966 and emails read correctly inside
 * Arabic (RTL) pages; names follow the text (`dir="auto"`).
 */
const {
  sanitizeCode,
  sanitizeEmail,
  sanitizeInteger,
  sanitizeMoney,
  sanitizeName,
  sanitizePhone,
  sanitizePlainText,
  sanitizeSlug,
} = validators;

/** Person name: Latin/Arabic letters, spaces, ' - . (no digits/symbols). Max 60. */
export const NameInput = (props) => (
  <SanitizedInput
    type="text"
    autoComplete="name"
    autoCapitalize="words"
    spellCheck={false}
    maxLength={60}
    dir="auto"
    sanitize={sanitizeName}
    {...props}
  />
);

/** Email: no spaces, lower-cased as typed. Max 254. */
export const EmailInput = (props) => (
  <SanitizedInput
    type="email"
    inputMode="email"
    autoComplete="email"
    autoCapitalize="none"
    autoCorrect="off"
    spellCheck={false}
    maxLength={254}
    dir="ltr"
    sanitize={sanitizeEmail}
    {...props}
  />
);

/** Phone: digits and a leading '+' only (Arabic-Indic digits converted). Normalized by the schema. */
export const PhoneInput = (props) => (
  <SanitizedInput
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    maxLength={17}
    dir="ltr"
    sanitize={sanitizePhone}
    {...props}
  />
);

/**
 * Money in MAJOR units (e.g. "19.99"): digits + one '.', max 2 decimals. The form schema
 * (`validators.moneyInput()`) converts to integer halalas. `currency` renders a visual suffix.
 */
export function MoneyInput({ currency, className, ...props }) {
  const input = (
    <SanitizedInput
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={15}
      dir="ltr"
      sanitize={sanitizeMoney}
      className={currency ? `${className ?? ''} pe-14` : className}
      {...props}
    />
  );
  if (!currency) return input;
  return (
    <div className="relative">
      {input}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground"
      >
        {currency}
      </span>
    </div>
  );
}

/** SKU / barcode: upper-cased, A–Z 0–9 - _ . only. */
export const CodeInput = (props) => (
  <SanitizedInput
    type="text"
    autoComplete="off"
    autoCapitalize="characters"
    spellCheck={false}
    maxLength={64}
    dir="ltr"
    sanitize={sanitizeCode}
    {...props}
  />
);

/** Free text without HTML/control characters (addresses, notes). */
export const PlainTextInput = (props) => (
  <SanitizedInput type="text" dir="auto" maxLength={250} sanitize={sanitizePlainText} {...props} />
);

/** Multi-line free text (descriptions): same rules as PlainTextInput, newlines allowed. */
export const PlainTextArea = (props) => (
  <SanitizedInput
    as="textarea"
    dir="auto"
    rows={4}
    maxLength={2000}
    sanitize={sanitizePlainText}
    {...props}
  />
);

/** URL slug: lower-case a–z, 0–9 and single hyphens (validate with validators.slug). */
export const SlugInput = (props) => (
  <SanitizedInput
    type="text"
    autoComplete="off"
    autoCapitalize="none"
    spellCheck={false}
    maxLength={120}
    dir="ltr"
    sanitize={sanitizeSlug}
    {...props}
  />
);

/** Address line: plain text with address autofill. */
export const AddressInput = (props) => (
  <PlainTextInput autoComplete="street-address" maxLength={250} {...props} />
);

/** Whole number (digits only). Prefer QtyInput for quantities. */
export const IntegerInput = (props) => (
  <SanitizedInput
    type="text"
    inputMode="numeric"
    autoComplete="off"
    dir="ltr"
    sanitize={sanitizeInteger}
    {...props}
  />
);
