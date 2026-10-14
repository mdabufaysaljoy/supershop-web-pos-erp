import { api, apiData } from '@/lib/apiClient';

const BASE = '/api/v1/payment-methods';

export const fetchPaymentMethods = () => apiData(BASE);
export const createPaymentMethod = (body) => apiData(BASE, { method: 'POST', body });
export const updatePaymentMethod = (id, body) =>
  apiData(`${BASE}/${id}`, { method: 'PATCH', body });
export const deletePaymentMethod = (id) => api(`${BASE}/${id}`, { method: 'DELETE' });
export const reorderPaymentMethods = (ids) =>
  apiData(`${BASE}/reorder`, { method: 'POST', body: { ids } });
