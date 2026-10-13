import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

export const products = createResource('products', '/api/v1/products');

/** One product with its variants (admin DTO). */
export const useProduct = (id) =>
  useQuery({
    queryKey: [...products.keys.all, 'detail', id],
    queryFn: () => apiData(`/api/v1/products/${id}`),
    enabled: Boolean(id),
  });

/** `(count) => Promise<string[]>` new in-store EAN-13 codes (errors toasted, rethrown). */
export function useGenerateBarcodes() {
  const { t } = useTranslation();
  return async (count) => {
    try {
      return (await apiData('/api/v1/products/barcodes', { method: 'POST', body: { count } }))
        .codes;
    } catch (err) {
      toast.error(errorMessage(t, err));
      throw err;
    }
  };
}

/** Scanned barcode / SKU → `{ product, variant, matchedBy }`. */
export const lookupProductByCode = (code) =>
  apiData('/api/v1/products/lookup', { query: { code } });
