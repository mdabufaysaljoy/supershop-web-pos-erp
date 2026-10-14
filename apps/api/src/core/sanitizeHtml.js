import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Server-side HTML sanitizing (CLAUDE.md §5.1). Builder content is the one place where staff may
 * write markup, so it is cleaned HERE, once, before it is stored — the renderers then print it
 * without thinking. A window is expensive to build, so one is reused for the process.
 */
const purify = createDOMPurify(new JSDOM('').window);

/** What a page may contain: text, structure, links, images. No scripts, no styles, no iframes. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];
const ALLOWED_ATTR = [
  'href',
  'title',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height',
  'dir',
  'lang',
];

/**
 * @param {string} html
 * @returns {string} safe HTML (never throws; anything unparseable becomes '')
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // `javascript:` and `data:` URLs never survive, whatever the tag.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}
