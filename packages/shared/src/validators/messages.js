/**
 * Validation message KEYS (not English text). Validators return these as zod issue messages;
 * the UI renders them with `t(key)` and the API forwards them in `error.details[].message`.
 * English copy lives in the i18n `en.json` (P0.11); Arabic is generated.
 */
export const V = Object.freeze({
  REQUIRED: 'validation.required',
  INVALID_TYPE: 'validation.invalidType',
  TOO_SHORT: 'validation.tooShort',
  TOO_LONG: 'validation.tooLong',

  NAME_INVALID: 'validation.name.invalid',
  EMAIL_INVALID: 'validation.email.invalid',
  PHONE_INVALID: 'validation.phone.invalid',
  PHONE_KSA_ONLY: 'validation.phone.ksaOnly',
  MONEY_INVALID: 'validation.money.invalid',
  MONEY_TOO_MANY_DECIMALS: 'validation.money.tooManyDecimals',
  MONEY_NEGATIVE: 'validation.money.negative',
  MONEY_ZERO: 'validation.money.zero',
  MONEY_TOO_LARGE: 'validation.money.tooLarge',
  QTY_INVALID: 'validation.quantity.invalid',
  QTY_TOO_LARGE: 'validation.quantity.tooLarge',
  ADDRESS_INVALID: 'validation.address.invalid',
  PASSWORD_TOO_SHORT: 'validation.password.tooShort',
  PASSWORD_TOO_LONG: 'validation.password.tooLong',
  PASSWORD_NEEDS_LOWER: 'validation.password.needsLower',
  PASSWORD_NEEDS_UPPER: 'validation.password.needsUpper',
  PASSWORD_NEEDS_DIGIT: 'validation.password.needsDigit',
  PASSWORD_NEEDS_SYMBOL: 'validation.password.needsSymbol',
  CODE_INVALID: 'validation.code.invalid',
  SLUG_INVALID: 'validation.slug.invalid',
  ID_INVALID: 'validation.id.invalid',
  SORT_INVALID: 'validation.sort.invalid',
  URL_INVALID: 'validation.url.invalid',
  DUPLICATE: 'validation.duplicate',
});
