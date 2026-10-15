import { useBarcodeScanner } from '@supershop/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt } from '@/lib/format';
import { lookupBarcode, useTillSearch } from '../resource';

/**
 * Scan-first (P6.2): a barcode typed by a scanner anywhere on the screen adds its item straight
 * away; otherwise the cashier types a name or SKU and Enter takes the top match. The field keeps
 * focus, because at a counter the next scan is always coming.
 */
export function TillSearch({ branchId, onAdd, disabled }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [scanError, setScanError] = useState(null);
  const input = useRef(null);
  const { data: results = [], isFetching } = useTillSearch(q, branchId);

  useEffect(() => {
    input.current?.focus();
  }, []);

  /** A scanner is a keyboard that types very fast and presses Enter (P1.6). */
  useBarcodeScanner({
    enabled: !disabled,
    onScan: async (code) => {
      setScanError(null);
      try {
        const { variant, product } = await lookupBarcode(code);
        onAdd({
          variantId: variant.id,
          productId: product.id,
          name: product.name?.en ?? product.name ?? '',
          sku: variant.sku,
          price: variant.price,
          options: variant.options ?? [],
        });
      } catch {
        setScanError(code);
      }
    },
  });

  const add = (item) => {
    onAdd(item);
    setQ('');
    input.current?.focus();
  };

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium" htmlFor="till-search">
        {t('pos.search.label')}
        <input
          id="till-search"
          ref={input}
          value={q}
          disabled={disabled}
          autoComplete="off"
          placeholder={t('pos.search.placeholder')}
          className="h-11 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault();
              add(results[0]);
            }
            if (e.key === 'Escape') setQ('');
          }}
        />
      </label>

      {scanError && (
        <p role="alert" className="text-sm text-destructive">
          {t('pos.search.unknownCode', { code: scanError })}
        </p>
      )}

      {q.trim().length >= 2 && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto">
          {results.length === 0 && !isFetching && (
            <li className="px-1 py-2 text-sm text-muted-foreground">{t('pos.search.nothing')}</li>
          )}
          {results.map((item) => (
            <li key={item.variantId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => add(item)}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-start hover:bg-muted"
              >
                <span className="grid flex-1">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.sku} · {t('pos.search.onHand', { count: item.onHand })}
                  </span>
                </span>
                <span className="tabular-nums">{fmt.money(item.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
