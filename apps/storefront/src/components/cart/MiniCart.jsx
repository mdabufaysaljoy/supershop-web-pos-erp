'use client';

import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { CartLines } from './CartLines';
import { useCart } from './CartProvider';
import { CartSummary } from './CartSummary';

/**
 * Slide-over mini-cart from the inline-end edge (right in English, left in Arabic). Radix
 * Dialog gives focus trap, Escape, scroll lock and labelled dialog semantics.
 */
export function MiniCart() {
  const t = useT();
  const lang = useLang();
  const { cart, open, setOpen, count, fmt } = useCart();
  const close = () => setOpen(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="sheet-end fixed inset-y-0 end-0 z-50 grid w-full max-w-md grid-rows-[auto_1fr_auto] bg-background shadow-xl outline-none"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-lg font-semibold">
              {t('cart.title')}{' '}
              {count > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({fmt.number(count)})
                </span>
              )}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t('cart.close')}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto p-4">
            {!cart?.items.length ? (
              <div className="grid gap-3 py-12 text-center">
                <p className="font-medium">{t('cart.empty')}</p>
                <Link
                  href={localizePath('/search', lang)}
                  onClick={close}
                  className="text-sm underline underline-offset-4"
                >
                  {t('cart.startShopping')}
                </Link>
              </div>
            ) : (
              <CartLines onNavigate={close} />
            )}
          </div>
          {cart?.items.length > 0 && (
            <div className="grid gap-3 border-t p-4">
              <CartSummary />
              <Link
                href={localizePath('/cart', lang)}
                onClick={close}
                className="text-center text-sm underline underline-offset-4"
              >
                {t('cart.viewCart')}
              </Link>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
