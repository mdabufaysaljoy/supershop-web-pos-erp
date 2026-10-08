import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';
import { createResource } from '@/lib/resource';

export const products = createResource('products', '/api/v1/products');

/** One product with its variants (admin DTO). */
export const useProduct = (id) =>
  useQuery({
    queryKey: [...products.keys.all, 'detail', id],
    queryFn: () => apiData(`/api/v1/products/${id}`),
    enabled: Boolean(id),
  });
