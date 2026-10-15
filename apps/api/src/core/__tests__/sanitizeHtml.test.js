import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../sanitizeHtml.js';

/** P5.1 — builder HTML is cleaned once, where it is stored (§5.1). */
describe('sanitizeHtml', () => {
  it('keeps the markup a page needs', () => {
    expect(sanitizeHtml('<p>Hi <strong>there</strong></p>')).toBe(
      '<p>Hi <strong>there</strong></p>',
    );
    expect(sanitizeHtml('<a href="/search" title="x">Shop</a>')).toContain('href="/search"');
    expect(sanitizeHtml('<ul><li>One</li></ul>')).toBe('<ul><li>One</li></ul>');
  });

  it('removes anything that could run', () => {
    expect(sanitizeHtml('<script>alert(1)</script><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeHtml('<p onclick="evil()">ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeHtml('<img src=x onerror="evil()">')).not.toContain('onerror');
    expect(sanitizeHtml('<a href="javascript:evil()">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<iframe src="https://evil.test"></iframe>')).toBe('');
    expect(sanitizeHtml('<p style="position:fixed">x</p>')).toBe('<p>x</p>');
  });

  it('answers with an empty string for nothing at all', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml('   ')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(42)).toBe('');
  });
});
