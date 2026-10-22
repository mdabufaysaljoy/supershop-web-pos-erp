import { tenderSummary } from '@supershop/shared';
import { useBarcodeScanner } from '@supershop/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/store';
import { brands } from '@/features/brands/resource';
import { useCategories } from '@/features/categories/hooks';
import { useInventoryBranches } from '@/features/inventory/resource';
import { usePrintingStatus, usePrintReceipt } from '@/features/printing/resource';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { PosBottomBar } from '../components/PosBottomBar';
import { PosCartColumn } from '../components/PosCartColumn';
import { PosCustomerModal } from '../components/PosCustomerModal';
import { HeldSalesButton, PosHeldSalesModal } from '../components/PosHeldSalesModal';
import { toast } from 'sonner';
import { PosPaymentColumn } from '../components/PosPaymentColumn';
import { PosProductGrid } from '../components/PosProductGrid';
import { PosReceiptDialog } from '../components/PosReceiptDialog';
import { PosRecentSalesModal } from '../components/PosRecentSalesModal';
import { SaleLines } from '../components/SaleLines';
import { ShiftBar } from '../components/ShiftBar';
import {
  lookupBarcode,
  lookupLoyalty,
  usePosPaymentMethods,
  useSell,
  useTillSearch,
} from '../resource';
import { useActiveBranchStore } from '@/features/branches/activeBranch';
import { customerPayload } from '../saleStorage';
import { useSale } from '../useSale';

/**
 * Modern 4-Column POS Workspace (Non-scrollable):
 * - Column 1: Filters (Barcode/keyword search, department & brand filters, branch switcher)
 * - Column 2: Products view (2 columns of cards, exactly 50 per page, bottom pagination)
 * - Column 3: Dedicated Product Cart (Lines, quantity adjust, item/cart discounts, subtotal)
 * - Column 4: Dedicated Payment Option (To pay, customer modal trigger, methods, change)
 * - Fixed Bottom Action Bar: Complete sale, Clear basket, Hold sale
 */
export function PosPage() {
  const { t } = useTranslation();
  const branches = useInventoryBranches();
  const cashierName = useAuthStore((s) => s.profile?.name ?? '');
  const staffId = useAuthStore((s) => s.profile?.id ?? '');

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [recentSalesOpen, setRecentSalesOpen] = useState(false);
  const [activeReceiptOrder, setActiveReceiptOrder] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const chosenBranch = useActiveBranchStore((s) => s.branchId);
  const chooseBranch = useActiveBranchStore((s) => s.setBranchId);
  const [payments, setPayments] = useState([]);
  const [done, setDone] = useState(null);
  const [online, setOnline] = useState(true);
  const [heldOpen, setHeldOpen] = useState(false);

  // Search & Filter state
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [scanError, setScanError] = useState(null);
  const searchInputRef = useRef(null);

  const sell = useSell();
  const posMethods = usePosPaymentMethods();
  const printing = usePrintingStatus();
  const printReceipt = usePrintReceipt();

  const options = branches.data ?? [];
  const branchId = chosenBranch || (options.length === 1 ? options[0].id : '');

  const sale = useSale(branchId, { staffId });
  const [saleKey, setSaleKey] = useState(() => crypto.randomUUID());

  // Till search query
  const { data: results = [], isFetching } = useTillSearch({
    q,
    branchId,
    categoryId: department,
    brandId: selectedBrand,
  });

  const { data: categoriesRaw } = useCategories();
  const { data: brandListRaw } = brands.useList();

  const categories = categoriesRaw?.data ?? (Array.isArray(categoriesRaw) ? categoriesRaw : []);
  const brandList = brandListRaw?.data ?? (Array.isArray(brandListRaw) ? brandListRaw : []);

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

  // Keyboard shortcut (F2) to focus till search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /**
   * A code the till was given — scanned anywhere on the page, or typed into the search box and
   * entered. It is a barcode if the catalogue knows one; otherwise the one thing on the shelf it
   * names; otherwise nothing the shop sells, and the cashier is told so.
   */
  /**
   * A scanner sends its code and then a terminator — and plenty of them send CR *and* LF. The
   * second one arrives with nothing buffered, so the wedge lets it through to the search box,
   * which would ring the same item up twice. One code within half a second is ONE scan: no hand
   * can rescan that fast, and a cashier who wants two of something scans twice over.
   */
  const lastScan = useRef({ code: '', at: 0 });
  const alreadyHandled = (code) => {
    const now = Date.now();
    const repeat = lastScan.current.code === code && now - lastScan.current.at < 500;
    lastScan.current = { code, at: now };
    return repeat;
  };

  const clearSearch = () => {
    setQ('');
    setScanError(null);
    searchInputRef.current?.focus();
  };

  const addByCode = async (code) => {
    const trimmed = String(code ?? '').trim();
    if (!trimmed || alreadyHandled(trimmed)) return false;
    try {
      const { variant, product } = await lookupBarcode(trimmed);
      if (variant && product) {
        sale.addItem({
          variantId: variant.id,
          productId: product.id,
          name: product.name?.en ?? product.name ?? '',
          sku: variant.sku,
          price: variant.price,
          options: variant.options ?? [],
        });
        clearSearch();
        return true;
      }
    } catch {
      // Not a barcode — it may still name exactly one thing on the shelf.
    }
    const matches = results ?? [];
    const exact =
      matches.find((item) => item.sku?.toLowerCase() === trimmed.toLowerCase()) ??
      (matches.length === 1 ? matches[0] : null);
    if (exact) {
      sale.addItem(exact);
      clearSearch();
      return true;
    }
    setScanError(trimmed);
    return false;
  };

  /** Barcode Scanner Wedge Hook */
  useBarcodeScanner({
    enabled: online && Boolean(branchId),
    onScan: async (code) => {
      setScanError(null);
      // 1. Check if the scanned code is a customer loyalty card (barcode or QR)
      try {
        const membership = await lookupLoyalty(code);
        if (membership?.customer) {
          sale.patch({
            customer: {
              mode: 'contact',
              id: membership.customer.id,
              customerId: membership.customer.id,
              name: membership.customer.name,
              phone: membership.customer.phone || '',
              email: membership.customer.email || null,
              loyalty: {
                pointsBalance: membership.pointsBalance,
                tier: membership.tier,
                cardNumber: membership.cardNumber,
              },
            },
          });
          toast.success(
            t('pos.loyalty.scannedAttached', {
              name: membership.customer.name,
              points: membership.pointsBalance,
              defaultValue: `Customer attached: ${membership.customer.name} (${membership.pointsBalance} pts)`,
            }),
          );
          return;
        }
      } catch {
        // Not a loyalty card, proceed to product lookup
      }

      // 2. A product: straight into the basket, with no click anywhere.
      await addByCode(code);
    },
  });

  const methods = useMemo(() => {
    if (sale.priced?.methods && sale.priced.methods.length > 0) return sale.priced.methods;
    if (posMethods.data && posMethods.data.length > 0) return posMethods.data;
    return [];
  }, [sale.priced?.methods, posMethods.data]);

  const total = sale.totals?.total ?? 0;
  const subtotal = sale.priced?.totals?.subtotal ?? sale.totals?.subtotal ?? total;
  const unsure = sale.stale || !online;
  const tender = useMemo(() => tenderSummary(total, payments), [total, payments]);

  const handleQChange = (newQ) => {
    setQ(newQ);
    setProductPage(1);
  };

  const handleDepartmentChange = (newDept) => {
    setDepartment(newDept);
    setProductPage(1);
  };

  const handleBrandChange = (newBrand) => {
    setSelectedBrand(newBrand);
    setProductPage(1);
  };

  const handleResetFilters = () => {
    setQ('');
    setDepartment('');
    setSelectedBrand('');
    setProductPage(1);
  };

  const handleSearchSubmit = async (searchVal) => {
    if (!searchVal || !searchVal.trim()) return;
    const trimmed = searchVal.trim();

    // 1. Try loyalty card barcode / QR scan or lookup
    try {
      const membership = await lookupLoyalty(trimmed);
      if (membership?.customer) {
        sale.patch({
          customer: {
            mode: 'contact',
            id: membership.customer.id,
            customerId: membership.customer.id,
            name: membership.customer.name,
            phone: membership.customer.phone || '',
            email: membership.customer.email || null,
            loyalty: {
              pointsBalance: membership.pointsBalance,
              tier: membership.tier,
              cardNumber: membership.cardNumber,
            },
          },
        });
        setQ('');
        toast.success(
          t('pos.loyalty.scannedAttached', {
            name: membership.customer.name,
            points: membership.pointsBalance,
            defaultValue: `Customer attached: ${membership.customer.name} (${membership.pointsBalance} pts)`,
          }),
        );
        return;
      }
    } catch {
      // Not a loyalty card
    }

    // 2. A product code, or the one thing the typed text names.
    await addByCode(trimmed);
  };

  const handleAddProduct = (item) => {
    sale.addItem(item);
    setQ('');
    searchInputRef.current?.focus();
  };

  const complete = async () => {
    const result = await sell
      .mutateAsync({
        body: {
          ...sale.body,
          // Only what the sale endpoint takes: the screen's own notes about a customer
          // (loyalty points, tier, card number) stay on the screen (D-176).
          customer: customerPayload(sale.sale.customer),
          // `auto` is the screen's own note about which tender was holding the balance (D-211).
          payments: payments.map(({ method, amount, reference }) => ({
            method,
            amount,
            ...(reference ? { reference } : {}),
          })),
          ...(sale.sale.note ? { note: sale.sale.note } : {}),
        },
        idempotencyKey: saleKey,
      })
      .catch(() => null);
    if (!result) return;
    setDone(result);
    setActiveReceiptOrder(result);
    setPayments([]);
    sale.clear();
    setSaleKey(crypto.randomUUID());
    if (printing.data?.enabled && printing.data?.autoPrintReceipt)
      printReceipt.mutate({ orderId: result.id });
  };

  if (branches.isPending) return <Skeleton className="h-96" />;

  return (
    <div className="h-[calc(100vh-7.5rem)] md:h-[calc(100vh-8rem)] flex flex-col overflow-hidden gap-2 pb-0.5">
      {/* Network & Pricing Alerts */}
      {!online && (
        <Alert variant="destructive" className="shrink-0">
          {t('pos.offline')}
        </Alert>
      )}
      {online && sale.stale && <Alert className="shrink-0">{t('pos.pricingFailed')}</Alert>}
      {sell.isError && (
        <Alert variant="destructive" className="shrink-0">
          {errorMessage(t, sell.error)}
        </Alert>
      )}

      {/* Sale Done Notification Alert */}
      {done && (
        <Alert className="shrink-0 flex flex-wrap items-center gap-3 bg-emerald-50 border-emerald-200 text-emerald-950 py-2">
          <span className="flex-1 font-medium text-xs">
            {t('pos.done', {
              orderNo: done.orderNo,
              total: fmt.money(done.totals.total),
              change: fmt.money(done.changeGiven),
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReceiptOpen(true)}
            className="h-7 text-xs bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-100"
          >
            {t('pos.viewReceipt', 'View Receipt')}
          </Button>
          {printing.data?.enabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printReceipt.isPending}
              onClick={() => printReceipt.mutate({ orderId: done.id })}
              className="h-7 text-xs bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-100"
            >
              {t('pos.printReceipt')}
            </Button>
          )}
        </Alert>
      )}

      {printReceipt.isError && (
        <Alert variant="destructive" className="shrink-0 py-2">
          {t('pos.printFailed', { reason: printReceipt.error?.message ?? '' })}
        </Alert>
      )}

      {!branchId ? (
        <div className="rounded border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-medium text-slate-500 flex flex-col items-center gap-4 m-auto">
          <p>{t('pos.chooseBranchFirst')}</p>
          <Select
            id="pos-branch-select"
            value={branchId}
            className="w-60 h-10 rounded text-xs font-medium"
            onChange={(e) => chooseBranch(e.target.value)}
          >
            <option value="">{t('pos.chooseBranch')}</option>
            {options.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name?.en ?? branch.code}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <ShiftBar branchId={branchId} />
          </div>

          {/* 11-Column Workspace Grid: Products (5 cols = ~45%), Cart (3 cols = ~27.5%), Payment (3 cols = ~27.5%) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 flex-1 min-h-0 items-stretch">
            {/* Column 1: Search, Filter & 2-Column Products Section (5 cols) */}
            <div className="min-w-0 min-h-0 h-full lg:col-span-4 flex flex-col">
              <PosProductGrid
                q={q}
                onQChange={handleQChange}
                onSearchSubmit={handleSearchSubmit}
                department={department}
                onDepartmentChange={handleDepartmentChange}
                selectedBrand={selectedBrand}
                onSelectedBrandChange={handleBrandChange}
                categories={categories}
                brandList={brandList}
                branchId={branchId}
                branchOptions={options}
                onSelectBranch={chooseBranch}
                linesCount={sale.sale.lines.length}
                disabled={!online}
                scanError={scanError}
                inputRef={searchInputRef}
                onResetFilters={handleResetFilters}
                onOpenRecentSales={() => setRecentSalesOpen(true)}
                results={results}
                isFetching={isFetching}
                onAdd={handleAddProduct}
                page={productPage}
                onPageChange={setProductPage}
              />
            </div>

            {/* Accessible container for Cart & Settlement */}
            <aside role="complementary" className="contents">
              {/* Column 2: Product Cart (3 cols) */}
              <div className="min-w-0 min-h-0 h-full lg:col-span-4 flex flex-col">
                <PosCartColumn
                  sale={sale.sale}
                  subtotal={subtotal}
                  onOrderDiscount={(discount) => sale.patch({ orderDiscount: discount })}
                >
                  <SaleLines
                    sale={sale.sale}
                    priced={sale.priced}
                    onQty={sale.setQty}
                    onDiscount={sale.setLineDiscount}
                  />
                </PosCartColumn>
              </div>

              {/* Column 3: Payment Option (3 cols) */}
              <div className="min-w-0 min-h-0 h-full lg:col-span-4 flex flex-col">
                <PosPaymentColumn
                  total={total}
                  tender={tender}
                  methods={methods}
                  payments={payments}
                  onChange={setPayments}
                  customer={sale.sale.customer}
                  onCustomerChange={(cust) => sale.patch({ customer: cust })}
                  onOpenCustomerModal={() => setCustomerModalOpen(true)}
                  heldButton={
                    <HeldSalesButton count={sale.held.length} onClick={() => setHeldOpen(true)} />
                  }
                  actions={
                    <PosBottomBar
                      lineCount={sale.sale.lines.length}
                      tender={tender}
                      busy={sell.isPending}
                      blocked={unsure || !sale.sale.lines.length}
                      payments={payments}
                      onClear={() => {
                        sale.clear();
                        setPayments([]);
                      }}
                      onHold={() => {
                        if (sale.hold(t('pos.held.defaultLabel'))) setPayments([]);
                      }}
                      onComplete={complete}
                      heldCount={sale.held.length}
                      onToggleHeld={() => setHeldOpen(true)}
                    />
                  }
                />
              </div>
            </aside>
          </div>
        </>
      )}

      {/* Modal: Customer Search by number/name, suggestions, and add new */}
      <PosCustomerModal
        open={customerModalOpen}
        onOpenChange={setCustomerModalOpen}
        customer={sale.sale.customer}
        onCustomerChange={(cust) => sale.patch({ customer: cust })}
      />

      {/* Modal: sales put aside, as a queue */}
      <PosHeldSalesModal
        open={heldOpen}
        onOpenChange={setHeldOpen}
        held={sale.held}
        onResume={(id) => {
          sale.resume(id);
          setPayments([]);
        }}
        onDrop={sale.drop}
      />

      {/* Modal: Recent Sales & Receipts lookup */}
      <PosRecentSalesModal
        open={recentSalesOpen}
        onOpenChange={setRecentSalesOpen}
        branchId={branchId}
        onSelectReceiptOrder={(saleOrder) => {
          setActiveReceiptOrder(saleOrder);
          setReceiptOpen(true);
        }}
      />

      {/* Dialog: Printable Thermal Receipt */}
      {(activeReceiptOrder || done) && (
        <PosReceiptDialog
          open={receiptOpen}
          onOpenChange={(open) => {
            setReceiptOpen(open);
            if (!open && !done) setActiveReceiptOrder(null);
          }}
          order={activeReceiptOrder || done}
          cashierName={cashierName}
          branchName={options.find((b) => b.id === branchId)?.name?.en || ''}
        />
      )}
    </div>
  );
}
