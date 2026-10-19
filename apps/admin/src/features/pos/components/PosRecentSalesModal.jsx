import { Loader2, Printer, Receipt, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { orders } from '@/features/orders/resource';
import { apiData } from '@/lib/apiClient';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';

/**
 * Modal for cashiers to look up recent sales and reprint thermal receipts.
 */
export function PosRecentSalesModal({ open, onOpenChange, branchId, onSelectReceiptOrder }) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [query, setQuery] = useState('');
  const [fetchingId, setFetchingId] = useState(null);

  const { data, isPending, isError, error } = orders.useList(
    {
      channel: 'pos',
      ...(branchId && { branchId }),
      ...(query && { q: query }),
      limit: 25,
    },
    { enabled: open },
  );

  const sales = data?.data ?? [];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setQuery(searchTerm.trim());
  };

  const handleReprint = async (sale) => {
    try {
      setFetchingId(sale.id);
      const fullOrder = await apiData(`/api/v1/orders/${sale.id}`);
      onSelectReceiptOrder(fullOrder);
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setFetchingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-lg border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Receipt className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-slate-900 leading-tight">
                {t('pos.recentSalesModal.title', 'Recent Sales & Receipts')}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {t(
                  'pos.recentSalesModal.description',
                  'Look up any previous sale to view or reprint its thermal receipt.',
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t(
                  'pos.recentSalesModal.searchPlaceholder',
                  'Search receipt # or customer phone...',
                )}
                className="w-full h-9 ps-9 pe-3 rounded-md border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary shadow-2xs"
              />
            </div>
            <Button type="submit" size="sm" className="h-9 px-4 text-xs font-semibold rounded-md">
              {t('pos.recentSalesModal.search', 'Search')}
            </Button>
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setQuery('');
                }}
                className="h-9 text-xs font-medium text-slate-500"
              >
                {t('pos.recentSalesModal.clear', 'Clear')}
              </Button>
            )}
          </form>
        </div>

        {/* Sales List Table */}
        <div className="max-h-[60vh] overflow-y-auto p-4 bg-slate-50/50">
          {isPending ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="text-xs">{t('common.loading', 'Loading sales...')}</span>
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-xs text-rose-600">{errorMessage(t, error)}</div>
          ) : sales.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              {t('pos.recentSalesModal.empty', 'No recent sales found.')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {sale.orderNo}
                      </span>
                      <Badge
                        tone={
                          sale.status === 'completed' || sale.status === 'paid' ? 'ok' : 'muted'
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {sale.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                      <span>
                        {fmt.dateTime(sale.placedAt, { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <span>·</span>
                      <span className="truncate">
                        {sale.customer?.name || t('pos.customer.walkin', 'Walk-in')}
                      </span>
                      {sale.customer?.phone && (
                        <>
                          <span>·</span>
                          <span dir="ltr">{sale.customer.phone}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{t('orders.items', { count: sale.itemCount })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold tabular-nums text-sm text-slate-900">
                      {fmt.money(sale.total)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={fetchingId === sale.id}
                      onClick={() => handleReprint(sale)}
                      className="h-8 gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 shadow-xs"
                    >
                      {fetchingId === sale.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Printer className="size-3.5" />
                      )}
                      <span>{t('pos.recentSalesModal.reprint', 'Reprint')}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
