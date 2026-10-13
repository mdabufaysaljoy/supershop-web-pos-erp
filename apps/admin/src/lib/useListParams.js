/**
 * `?page&q` list state in the URL (shareable, survives reload).
 * @param {ReturnType<typeof import('react-router').useSearchParams>} searchParams
 */
export function useListParams([params, setParams]) {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const go = (next) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === '' || v == null || (k === 'page' && v === 1)) p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p);
  };
  return { page, q, go };
}
