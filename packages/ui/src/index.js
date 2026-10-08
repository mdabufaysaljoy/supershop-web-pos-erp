/**
 * @supershop/ui — shared React components for admin and storefront.
 * Field components (CLAUDE.md §5.3) + form kit. Text props are already-translated strings.
 */
export { FormField, useFieldControlProps } from './form/FormField.jsx';
export { SanitizedInput } from './fields/SanitizedInput.jsx';
export {
  AddressInput,
  CodeInput,
  EmailInput,
  IntegerInput,
  MoneyInput,
  NameInput,
  PhoneInput,
  PlainTextArea,
  PlainTextInput,
  SlugInput,
} from './fields/fields.jsx';
export { QtyInput } from './fields/QtyInput.jsx';
export { PasswordInput } from './fields/PasswordInput.jsx';
export { applySanitizer, blockInvalidInsertion } from './fields/sanitizeInput.js';
export { inputClass } from './fields/styles.js';
export { Barcode } from './scanner/Barcode.jsx';
export { BarcodeInput } from './scanner/BarcodeInput.jsx';
export { charFromKeyEvent } from './scanner/keys.js';
export { createWedgeDetector } from './scanner/wedge.js';
export { useBarcodeScanner } from './scanner/useBarcodeScanner.js';
