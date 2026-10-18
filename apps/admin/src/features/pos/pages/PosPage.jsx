import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/features/settings/components/controls';
import { useInventoryBranches } from '@/features/inventory/resource';
import { usePrintingStatus, usePrintReceipt } from '@/features/printing/resource';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { PaymentPanel } from '../components/PaymentPanel';
import { SaleLines } from '../components/SaleLines';
import { ShiftBar } from '../components/ShiftBar';
import { TillSearch } from '../components/TillSearch';
import { useSell } from '../resource';
import { useSale } from '../useSale';

/**
 * The till (P6.2): matches modern structured layout with 2-column split,
 * left scan/search catalogue with filters, and right basket + payment panel.
 */
const BRANCH_KEY = 'pos.branch';

export function PosPage() {
  const { t } = useTranslation();
  const branches = useInventoryBranches();
  const [chosenBranch, setChosenBranch] = useState(() => localStorage.getItem(BRANCH_KEY) ?? '');
  const [payments, setPayments] = useState([]);
  const [done, setDone] = useState(null);
  const [online, setOnline] = useState(true);
  const [showHeld, setShowHeld] = useState(false);
  const sell = useSell();
  const printing = usePrintingStatus();
  const printReceipt = usePrintReceipt();

  const options = branches.data ?? [];
  const branchId = chosenBranch || (options.length === 1 ? options[0].id : '');
  const chooseBranch = (id) => {
    setChosenBranch(id);
    try {
      localStorage.setItem(BRANCH_KEY, id);
    } catch {
      // Graceful fallback
    }
  };
  const sale = useSale(branchId);
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
  const subtotal = sale.priced?.totals?.subtotal ?? sale.totals?.subtotal ?? total;
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
    if (printing.data?.enabled && printing.data?.autoPrintReceipt)
      printReceipt.mutate({ orderId: result.id });
  };

  if (branches.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-5">
      {/* Top Header Strip: Title, Description, and Branch Selector */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{t('pos.title')}</h1>
          <p className="text-xs text-slate-500">{t('pos.description')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="pos-branch-select" className="text-xs font-semibold text-slate-600">
            {t('pos.branch')}:
          </label>
          <Select
            id="pos-branch-select"
            value={branchId}
            className="w-52 h-9 rounded-xl text-xs font-medium"
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
        </div>
      </header>

      {/* Network & Pricing Alerts */}
      {!online && <Alert variant="destructive">{t('pos.offline')}</Alert>}
      {online && sale.stale && <Alert>{t('pos.pricingFailed')}</Alert>}
      {sell.isError && <Alert variant="destructive">{errorMessage(t, sell.error)}</Alert>}

      {/* Success Notification Alert */}
      {done && (
        <Alert className="flex flex-wrap items-center gap-3 bg-emerald-50 border-emerald-200 text-emerald-950">
          <span className="flex-1 font-medium">
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
              className="bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-100"
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
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-medium text-slate-500">
          {t('pos.chooseBranchFirst')}
        </p>
      ) : (
        <>
          <ShiftBar branchId={branchId} />

          {/* Structured Two-Column POS Workspace */}
          <div className="grid gap-6 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_440px] items-start">
            {/* Left Column: Scan or search, department & brand filters, products list */}
            <div className="min-w-0">
              <TillSearch branchId={branchId} onAdd={sale.addItem} disabled={!online} />
            </div>

            {/* Right Column: Unified Basket, Financial Summary & Saudi Settlement */}
            <aside role="complementary" className="w-full grid gap-4">
              <PaymentPanel
                total={total}
                subtotal={subtotal}
                methods={methods}
                payments={payments}
                busy={sell.isPending}
                blocked={unsure || !sale.sale.lines.length}
                sale={sale.sale}
                onOrderDiscount={(discount) => sale.patch({ orderDiscount: discount })}
                onCustomerChange={(customer) => sale.patch({ customer })}
                onHold={() => sale.hold(t('pos.held.defaultLabel'))}
                onClear={() => {
                  sale.clear();
                  setPayments([]);
                }}
                heldCount={sale.held.length}
                onToggleHeld={() => setShowHeld((v) => !v)}
                onChange={setPayments}
                onComplete={complete}
              >
                <SaleLines
                  sale={sale.sale}
                  priced={sale.priced}
                  onQty={sale.setQty}
                  onDiscount={sale.setLineDiscount}
                />
              </PaymentPanel>

              {/* Held Sales Section */}
              {(showHeld || sale.held.length > 0) && (
                <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs grid gap-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      {t('pos.held.title')} ({sale.held.length})
                    </h2>
                  </div>
                  {sale.held.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">No held sales right now.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 grid gap-1">
                      {sale.held.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-2 py-2 text-xs"
                        >
                          <span className="flex-1 font-medium text-slate-700">
                            {t('pos.held.entry', {
                              count: entry.sale.lines.length,
                              time: fmt.dateTime(entry.at, { timeStyle: 'short' }),
                            })}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="font-semibold text-primary hover:underline"
                              onClick={() => sale.resume(entry.id)}
                            >
                              {t('pos.held.resume')}
                            </button>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-destructive underline"
                              onClick={() => sale.drop(entry.id)}
                            >
                              {t('common.remove')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
