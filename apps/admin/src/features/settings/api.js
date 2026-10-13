import { api, apiData } from '@/lib/apiClient';

const I18N = '/api/v1/i18n';

export const fetchSettings = (group) => apiData('/api/v1/settings', { query: { group } });
export const saveSettings = (changes) =>
  apiData('/api/v1/settings', { method: 'PATCH', body: { changes } });

export const fetchI18nOverview = () => apiData(`${I18N}/overview`);
export const testProvider = () => apiData(`${I18N}/provider/test`, { method: 'POST' });

export const fetchGlossary = () => apiData(`${I18N}/glossary`);
export const createGlossaryTerm = (body) => apiData(`${I18N}/glossary`, { method: 'POST', body });
export const updateGlossaryTerm = (id, body) =>
  apiData(`${I18N}/glossary/${id}`, { method: 'PATCH', body });
export const deleteGlossaryTerm = (id) => api(`${I18N}/glossary/${id}`, { method: 'DELETE' });

const overrideUrl = (lang, key) =>
  `${I18N}/admin/ui-overrides/storefront/${lang}${key ? `/${key}` : ''}`;
export const fetchUiOverrides = (lang) => apiData(overrideUrl(lang));
export const saveUiOverride = (lang, key, body) =>
  apiData(overrideUrl(lang, key), { method: 'PUT', body });
export const deleteUiOverride = (lang, key) => api(overrideUrl(lang, key), { method: 'DELETE' });

export const retranslate = (scope) =>
  apiData(`${I18N}/retranslate`, { method: 'POST', body: { scope } });
export const retryJob = (id) =>
  api(`${I18N}/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
export const retryAllFailed = () => api(`${I18N}/jobs/retry-failed`, { method: 'POST' });
