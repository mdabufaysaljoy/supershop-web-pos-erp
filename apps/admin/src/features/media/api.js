import { api, apiData } from '@/lib/apiClient';

const BASE = '/api/v1/media';

/** @returns {Promise<{ data: object[], meta: { page: number, limit: number, total: number } }>} */
export const fetchMedia = (query) => api(BASE, { query });

/** One file per request (the API accepts a single `file` part). Resolves to `{ data, meta }`. */
export function uploadMedia(file, { alt } = {}) {
  const body = new FormData();
  if (alt) body.append('alt', alt);
  body.append('file', file);
  return api(BASE, { method: 'POST', body });
}

export const updateMedia = (id, body) => apiData(`${BASE}/${id}`, { method: 'PATCH', body });
export const deleteMedia = (id) => api(`${BASE}/${id}`, { method: 'DELETE' });
