import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@/lib/i18n';
import { webcrypto } from 'node:crypto';

// jsdom lacks crypto.subtle (used to fingerprint English UI strings).
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

afterEach(() => cleanup());
