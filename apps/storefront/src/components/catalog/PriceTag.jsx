import { cn } from '@/lib/cn';

/**
 * Price with an optional "was" price. Pure (server or client): pass the caller's `fmt`/`t`.
 * `from` = the product has several prices (cards show "From X").
 */
export function PriceTag({ price, compareAt, from = false, fmt, t, className, size = 'md' }) {
  const onSale = compareAt != null && compareAt > price;
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-semibold tabular-nums', size === 'lg' ? 'text-2xl' : 'text-base')}>
        {from ? t('catalog.from', { price: fmt.money(price) }) : fmt.money(price)}
      </span>
      {onSale && (
        <>
          <s className="text-sm text-muted-foreground tabular-nums">
            <span className="sr-only">{t('catalog.wasPrice')} </span>
            {fmt.money(compareAt)}
          </s>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {t('catalog.save', { percent: Math.round((1 - price / compareAt) * 100) })}
          </span>
        </>
      )}
    </p>
  );
}
