import { api, apiData } from '@/lib/apiClient';

const BASE = '/api/v1/categories';

export const fetchCategories = () => apiData(BASE);
export const createCategory = (body) => apiData(BASE, { method: 'POST', body });
export const updateCategory = (id, body) => apiData(`${BASE}/${id}`, { method: 'PATCH', body });
export const moveCategory = (id, body) => apiData(`${BASE}/${id}/move`, { method: 'POST', body });
export const deleteCategory = (id) => api(`${BASE}/${id}`, { method: 'DELETE' });
