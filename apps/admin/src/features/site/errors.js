import { useState } from 'react';

/**
 * Field errors from the API, kept beside a form: the server validates with the same zod schema,
 * so `details` already carries the path and the message key the form needs.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState({});
  /** Runs a save; returns what came back (or false), and keeps any field errors for the form. */
  const run = async (promise) => {
    setErrors({});
    try {
      return (await promise) ?? true;
    } catch (err) {
      // Any error carrying field details belongs beside the field — a clash (409) as much as a
      // validation failure; anything without details was already toasted by the mutation.
      if (err?.details?.length)
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      return false;
    }
  };
  return { errors, run };
}
