import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';
import { createResource } from '@/lib/resource';

/**
 * Roles (P0.5): a named set of permissions a staff account is given. The shop starts with ready-made
 * ones it can tune, and may add its own.
 */
export const roles = createResource('roles', '/api/v1/roles');

/**
 * Every permission the system knows, grouped by what it is about — the role editor's own contents,
 * so a new permission appears here the moment it is registered, with no screen to change.
 * @returns {{ data?: { groups: Record<string, string[]>, all: string[] } }}
 */
export const usePermissionRegistry = () =>
  useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => apiData('/api/v1/roles/permissions'),
    staleTime: 10 * 60_000,
  });
