import 'server-only';
import { createFormatters } from '@supershop/shared';
import { cache } from 'react';
import { getDictionary, translator } from '@/i18n/dictionaries';
import { getPublicSettings } from './api';
import { formatOptions } from './catalog';

/** Everything a server page needs to render text: settings, `t`, formatters (per request). */
export const getPageContext = cache(async (lang) => {
  const [settings, dict] = await Promise.all([getPublicSettings(), getDictionary(lang)]);
  const fmtOptions = formatOptions(lang, settings);
  return { settings, t: translator(dict), fmt: createFormatters(fmtOptions), fmtOptions };
});
