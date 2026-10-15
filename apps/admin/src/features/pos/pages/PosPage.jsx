import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/features/settings/components/controls';
import { useInventoryBranches } from '@/features/inventory/resource';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { usePrintingStatus, usePrintReceipt } from '@/features/printing/resource';
import { CustomerBar } from '../components/CustomerBar';
import { PaymentPanel } from '../components/PaymentPanel';
import { SaleLines } from '../components/SaleLines';
import { TillSearch } from '../components/TillSearch';
import { useSell } from '../resource';
import { useSale } from '../useSale';

/**
 * The till (P6.2). Scan or type on the left, take the money on the right, and nothing in between:
 * a sale is rung up in one screen without a dialog.
 *
 * Three things make it usable at a counter: the search keeps focus so the next scan always lands;
 * the money on screen is the server's own pricing, not a sum the browser made up; and when the
 * connection drops the basket stays, can be held, and payment waits rather than guessing.
 */
const BRANCH_KEY = 'pos.branch';

export function PosPage() {
  const { t } = useTranslation();
  const branches = useInventoryBranches();
  const [chosenBranch, setChosenBranch] = useState(() => localStorage.getItem(BRANCH_KEY) ?? '');
  const [payments, setPayments] = useState([]);
  const [done, setDone] = useState(null);
  const [online, setOnline] = useState(true);
  const sell = useSell();
  const printing = usePrintingStatus();
  const printReceipt = usePrintReceipt();
  // A till stands in one shop: the branch is remembered, and chosen for a cashier who has one.
  const options = branches.data ?? [];
  const branchId = chosenBranch || (options.length === 1 ? options[0].id : '');
  const chooseBranch = (id) => {
    setChosenBranch(id);
    try {
      localStorage.setItem(BRANCH_KEY, id);
    } catch {
      // A till that cannot remember its branch still sells; the cashier picks it again.
    }
  };
  const sale = useSale(branchId);
  /** One key per basket: a retry after a timeout returns the first sale, never a second one. */
  const [saleKey, setSaleKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const methods = useMemo(() => sale.priced?.methods ?? [], [sale.priced]);
  const total = sale.totals?.total ?? 0;
  const unsure = sale.stale || !online;

  const complete = async () => {
    const result = await sell
      .mutateAsync({
        body: { ...sale.body, customer: sale.sale.customer, payments, note: sale.sale.note },
        idempotencyKey: saleKey,
      })
      .catch(() => null);
    if (!result) return;
    setDone(result);
    setPayments([]);
    sale.clear();
    setSaleKey(crypto.randomUUID());
    // The receipt prints itself: at a counter nobody should have to ask for one (P6.3).
    if (printing.data?.enabled && printing.data?.autoPrintReceipt)
      printReceipt.mutate({ orderId: result.id });
  };

  if (branches.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('pos.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pos.description')}</p>
        </div>
        <label className="grid gap-1 text-sm">
          {t('pos.branch')}
          <Select
            value={branchId}
            className="w-56"
            onChange={(e) => chooseBranch(e.target.value)}
            disabled={sale.sale.lines.length > 0}
          >
            <option value="">{t('pos.chooseBranch')}</option>
            {options.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name?.en ?? branch.code}
              </option>
            ))}
          </Select>
        </label>
      </header>

      {!online && <Alert variant="destructive">{t('pos.offline')}</Alert>}
      {online && sale.stale && <Alert>{t('pos.pricingFailed')}</Alert>}
      {sell.isError && <Alert variant="destructive">{errorMessage(t, sell.error)}</Alert>}
      {done && (
        <Alert className="flex flex-wrap items-center gap-3">
          <span className="flex-1">
            {t('pos.done', {
              orderNo: done.orderNo,
              total: fmt.money(done.totals.total),
              change: fmt.money(done.changeGiven),
            })}
          </span>
          {printing.data?.enabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printReceipt.isPending}
              onClick={() => printReceipt.mutate({ orderId: done.id })}
            >
              {t('pos.printReceipt')}
            </Button>
          )}
        </Alert>
      )}
      {printReceipt.isError && (
        <Alert variant="destructive">
          {t('pos.printFailed', { reason: printReceipt.error?.message ?? '' })}
        </Alert>
      )}

      {!branchId ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('pos.chooseBranchFirst')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem] lg:items-start">
          <div className="grid gap-4">
            <TillSearch branchId={branchId} onAdd={sale.addItem} disabled={!online} />
            <SaleLines
              sale={sale.sale}
              priced={sale.priced}
              onQty={sale.setQty}
              onDiscount={sale.setLineDiscount}
              onOrderDiscount={(discount) => sale.patch({ orderDiscount: discount })}
            />
          </div>

          <aside className="grid gap-4">
            <CustomerBar
              customer={sale.sale.customer}
              onChange={(customer) => sale.patch({ customer })}
            />
            <PaymentPanel
              total={total}
              methods={methods}
              payments={payments}
              busy={sell.isPending}
              blocked={unsure || !sale.sale.lines.length}
              onChange={setPayments}
              onComplete={complete}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!sale.sale.lines.length}
                onClick={() => sale.hold(t('pos.held.defaultLabel'))}
              >
                {t('pos.held.hold')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!sale.sale.lines.length}
                onClick={() => {
                  sale.clear();
                  setPayments([]);
                }}
              >
                {t('pos.clear')}
              </Button>
            </div>

            {sale.held.length > 0 && (
              <section className="grid gap-2 rounded-xl border p-3">
                <h2 className="text-sm font-medium">{t('pos.held.title')}</h2>
                <ul className="grid gap-1">
                  {sale.held.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        {t('pos.held.entry', {
                          count: entry.sale.lines.length,
                          time: fmt.dateTime(entry.at, { timeStyle: 'short' }),
                        })}
                      </span>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => sale.resume(entry.id)}
                      >
                        {t('pos.held.resume')}
                      </button>
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => sale.drop(entry.id)}
                      >
                        {t('common.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
