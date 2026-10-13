import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';
import { createResource } from '@/lib/resource';

export const customFields = createResource('customFields', '/api/v1/custom-fields');

/** Definitions of one entity (all staff may read them; forms render from these). */
export const useFieldDefinitions = (entity) =>
  useQuery({
    queryKey: [...customFields.keys.all, entity],
    queryFn: () => apiData('/api/v1/custom-fields', { query: { entity } }),
  });
