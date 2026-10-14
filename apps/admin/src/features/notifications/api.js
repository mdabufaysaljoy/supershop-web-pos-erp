import { apiData } from '@/lib/apiClient';

const BASE = '/api/v1/notifications';

export const fetchTemplates = () => apiData(`${BASE}/templates`);
export const updateTemplate = (id, body) =>
  apiData(`${BASE}/templates/${id}`, { method: 'PATCH', body });
export const fetchLogs = (query) => apiData(`${BASE}/logs`, { query });
export const sendTest = (body) => apiData(`${BASE}/test`, { method: 'POST', body });
