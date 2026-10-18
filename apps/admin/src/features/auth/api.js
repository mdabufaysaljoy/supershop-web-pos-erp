import { CSRF_HEADER } from '@supershop/shared';
import { api, apiData, refreshAccessToken } from '@/lib/apiClient';

const AUTH = '/api/v1/auth/staff';

export const login = (body) => apiData(`${AUTH}/login`, { method: 'POST', body, auth: false });
export const challenge2fa = (body) =>
  apiData(`${AUTH}/2fa/challenge`, { method: 'POST', body, auth: false });
export const get2faStatus = () => apiData(`${AUTH}/2fa/status`);
export const setup2fa = () => apiData(`${AUTH}/2fa/setup`, { method: 'POST' });
export const verify2fa = (body) => apiData(`${AUTH}/2fa/verify`, { method: 'POST', body });
export const disable2fa = (body) => apiData(`${AUTH}/2fa/disable`, { method: 'POST', body });
export const fetchProfile = () => apiData(`${AUTH}/me`);
export const fetchAccess = () => apiData('/api/v1/staff/me/access');
export const logout = () =>
  api(`${AUTH}/logout`, { method: 'POST', auth: false, headers: { [CSRF_HEADER]: '1' } });
export const logoutAll = () => api(`${AUTH}/logout-all`, { method: 'POST' });
export { refreshAccessToken };
