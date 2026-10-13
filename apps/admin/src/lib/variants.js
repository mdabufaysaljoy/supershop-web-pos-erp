import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';

/** "Red / M" from a variant summary's option values (English source). */
export const optionLabel = (variant) =>
  (variant?.options ?? [])
    .map((o) => o.value?.en)
    .filter(Boolean)
    .join(' / ');

/** Variant search (SKU prefix, barcode, product name). */
export const useVariantSearch = (q) =>
  useQuery({
    queryKey: ['variants', 'search', q],
    queryFn: () => apiData('/api/v1/products/variants', { query: { q, limit: 20 } }),
    enabled: q.length > 0,
  });
