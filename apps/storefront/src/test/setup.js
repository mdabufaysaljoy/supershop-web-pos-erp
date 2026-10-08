import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// DOM cleanup only where a DOM exists (most storefront tests run in node).
afterEach(async () => {
  if (typeof document !== 'undefined') (await import('@testing-library/react')).cleanup();
});
