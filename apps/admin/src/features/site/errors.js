import { useState } from 'react';

/**
 * Field errors from the API, kept beside a form: the server validates with the same zod schema,
 * so `details` already carries the path and the message key the form needs.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState({});
  /** Runs a save; returns whether it went through, and keeps any field errors for the form. */
  const run = async (promise) => {
    setErrors({});
    try {
      await promise;
      return true;
    } catch (err) {
      if (err?.code === 'VALIDATION_ERROR')
        setErrors(Object.fromEntries((err.details ?? []).map((d) => [d.path, d.message])));
      return false;
    }
  };
  return { errors, run };
}
