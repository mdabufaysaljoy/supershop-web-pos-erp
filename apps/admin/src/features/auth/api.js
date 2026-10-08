import { CSRF_HEADER } from '@supershop/shared';
import { api, apiData, refreshAccessToken } from '@/lib/apiClient';

const AUTH = '/api/v1/auth/staff';

export const login = (body) => apiData(`${AUTH}/login`, { method: 'POST', body, auth: false });
export const fetchProfile = () => apiData(`${AUTH}/me`);
export const fetchAccess = () => apiData('/api/v1/staff/me/access');
export const logout = () =>
  api(`${AUTH}/logout`, { method: 'POST', auth: false, headers: { [CSRF_HEADER]: '1' } });
export const logoutAll = () => api(`${AUTH}/logout-all`, { method: 'POST' });
export { refreshAccessToken };
