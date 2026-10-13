/** Combines several refs (callback or object) into one callback ref. */
export const mergeRefs =
  (...refs) =>
  (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };

/**
 * Sets an input's value the way a user would: via the native setter + a bubbling `input` event,
 * so React's onChange (and therefore react-hook-form `register`) sees the change.
 * @param {HTMLInputElement} input
 * @param {string} value
 */
export function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
