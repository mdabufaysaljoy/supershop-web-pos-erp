/** Validation messages from the API are i18n keys; anything else shows as a generic message. */
export const fieldError = (t, message) =>
  message ? (message.startsWith('validation.') ? t(message) : message) : undefined;
