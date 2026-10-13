import { SOURCE_LANGUAGE } from '@supershop/shared';
import { getTargetLanguages } from './languages.js';

/**
 * Language for a PUBLIC response (CLAUDE.md §5.7): `?lang=` → `lang` cookie → Accept-Language →
 * source language. Only enabled languages are returned. Responses that depend on it must send
 * `Vary: Accept-Language, Cookie` so shared caches keep languages apart.
 * @param {import('express').Request} req
 * @param {string} [explicit]  already-validated `?lang=` value
 */
export function requestLanguage(req, explicit) {
  const enabled = new Set([SOURCE_LANGUAGE, ...getTargetLanguages()]);
  if (explicit && enabled.has(explicit)) return explicit;
  const cookie = req.cookies?.lang;
  if (typeof cookie === 'string' && enabled.has(cookie)) return cookie;

  const header = req.get?.('accept-language') ?? '';
  const ranked = header
    .split(',')
    .slice(0, 20)
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(
        params
          .find((p) => p.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? 1,
      );
      return { lang: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.find((x) => enabled.has(x.lang))?.lang ?? SOURCE_LANGUAGE;
}
