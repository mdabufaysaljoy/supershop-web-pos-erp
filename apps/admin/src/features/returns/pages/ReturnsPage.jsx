import { PERMISSIONS as P, priceReturnedLines, RETURN_EXCHANGE } from '@supershop/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyInput, PlainTextInput } from '@supershop/ui';
import { useInventoryBranches } from '@/features/inventory/resource';
import { useTillSearch } from '@/features/pos/resource';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { ReturnReceiptDialog } from '../components/ReturnReceiptDialog';
import { useCreateReturn, useLookupReturnOrder, useReturns } from '../resource';

const PAGE_SIZE = 15;
const EMPTY_ITEMS = [];
const toHalalas = (str) => {
  const n = Number(str);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

export function ReturnsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canCreate = can(P.RETURN_CREATE);
  const branches = useInventoryBranches();
  const searchParams = useSearchParams();
  const { page, go } = useListParams(searchParams);
  const initialOrderQuery = searchParams[0].get('order') ?? '';
  const filterType = searchParams[0].get('type') ?? '';
  const filterBranch = searchParams[0].get('branchId') ?? '';

  const [orderInput, setOrderInput] = useState(initialOrderQuery);
  const [submittedOrderQuery, setSubmittedOrderQuery] = useState(initialOrderQuery);
  const lookup = useLookupReturnOrder(submittedOrderQuery, {
    enabled: Boolean(submittedOrderQuery.trim()),
  });

  const [mode, setMode] = useState('return'); // 'return' | 'exchange'
  const [selectedLines, setSelectedLines] = useState({}); // { [variantId]: { qty, disposition } }
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  // Exchange state
  const [productQuery, setProductQuery] = useState('');
  const [exchangeItems, setExchangeItems] = useState([]); // [{ variantId, sku, name, unitPrice, qty }]
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [tenderAmount, setTenderAmount] = useState('');

  // Completed / selected receipt dialog
  const [activeReceipt, setActiveReceipt] = useState(null); // { id, record }

  const loadedOrder = lookup.data?.order ?? null;
  const orderItems = lookup.data?.items ?? EMPTY_ITEMS;
  const paymentMethods = lookup.data?.methods ?? [{ key: 'cash', label: 'Cash', type: 'cash' }];

  const tillSearch = useTillSearch(productQuery, loadedOrder?.branchId ?? '');
  const createReturn = useCreateReturn();

  const historyList = useReturns({
    page,
    limit: PAGE_SIZE,
    ...(filterBranch && { branchId: filterBranch }),
    ...(filterType && { type: filterType }),
  });

  const priorMap = useMemo(() => {
    const map = new Map();
    for (const rec of lookup.data?.priorReturns ?? []) {
      for (const line of rec.returnLines ?? []) {
        const vid = String(line.variantId);
        const prev = map.get(vid) ?? {
          qty: 0,
          lineTotal: 0,
          net: 0,
          vat: 0,
          discountTotal: 0,
        };
        map.set(vid, {
          qty: prev.qty + (line.qty ?? 0),
          lineTotal: prev.lineTotal + (line.lineTotal ?? 0),
          net: prev.net + (line.net ?? 0),
          vat: prev.vat + (line.vat ?? 0),
          discountTotal: prev.discountTotal + (line.discountTotal ?? 0),
        });
      }
    }
    return map;
  }, [lookup.data?.priorReturns]);

  const activeReturnLines = useMemo(() => {
    const lines = [];
    for (const item of orderItems) {
      const sel = selectedLines[item.variantId];
      const qty = Math.min(Number(sel?.qty ?? 0), item.returnableQty);
      if (qty > 0) {
        lines.push({
          variantId: item.variantId,
          qty,
          disposition: sel?.disposition ?? 'restock',
        });
      }
    }
    return lines;
  }, [orderItems, selectedLines]);

  const pricedReturn = useMemo(() => {
    if (!orderItems.length || !activeReturnLines.length) {
      return {
        lines: [],
        totals: { itemCount: 0, subtotal: 0, discountTotal: 0, net: 0, vat: 0, total: 0 },
      };
    }
    return priceReturnedLines(orderItems, activeReturnLines, priorMap);
  }, [orderItems, activeReturnLines, priorMap]);

  const exchangeTotal = useMemo(
    () => exchangeItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [exchangeItems],
  );
  const returnCredit = pricedReturn.totals.total;
  const shortfall = Math.max(0, returnCredit - exchangeTotal);
  const differenceDue = Math.max(0, exchangeTotal - returnCredit);
  const exchangeValid = mode !== 'exchange' || (exchangeItems.length > 0 && shortfall === 0);

  const handleFindOrder = (e) => {
    e.preventDefault();
    const q = orderInput.trim();
    if (!q) return;
    setSelectedLines({});
    setExchangeItems([]);
    setTenderAmount('');
    setSubmittedOrderQuery(q);
  };

  const setLineQty = (variantId, rawQty, maxQty) => {
    const qty = Math.max(0, Math.min(maxQty, Number.parseInt(rawQty || '0', 10) || 0));
    setSelectedLines((prev) => ({
      ...prev,
      [variantId]: {
        qty,
        disposition: prev[variantId]?.disposition ?? 'restock',
      },
    }));
  };

  const setLineDisposition = (variantId, disposition) => {
    setSelectedLines((prev) => ({
      ...prev,
      [variantId]: {
        qty: prev[variantId]?.qty ?? 0,
        disposition,
      },
    }));
  };

  const addExchangeItem = (hit) => {
    setExchangeItems((prev) => {
      const existing = prev.find((i) => i.variantId === hit.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === hit.variantId ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          variantId: hit.variantId,
          sku: hit.sku,
          name: hit.name,
          unitPrice: hit.price,
          qty: 1,
        },
      ];
    });
    setProductQuery('');
  };

  const updateExchangeQty = (variantId, nextQty) => {
    if (nextQty <= 0) {
      setExchangeItems((prev) => prev.filter((i) => i.variantId !== variantId));
      return;
    }
    setExchangeItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, qty: nextQty } : i)),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loadedOrder || activeReturnLines.length === 0) return;
    if (mode === 'exchange' && !exchangeValid) return;

    const paidAmount =
      tenderAmount === '' ? differenceDue : Math.max(differenceDue, toHalalas(tenderAmount));

    const body = {
      type: mode,
      orderId: loadedOrder.id,
      branchId: loadedOrder.branchId,
      returnLines: activeReturnLines,
      ...(mode === 'return'
        ? { refundMethod }
        : {
            exchangeItems: exchangeItems.map((i) => ({
              variantId: i.variantId,
              qty: i.qty,
            })),
            payments: differenceDue > 0 ? [{ method: paymentMethod, amount: paidAmount }] : [],
          }),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ret-${Date.now()}`;

    const created = await createReturn.mutateAsync({ body, idempotencyKey }).catch(() => null);
    if (!created) return;

    setSelectedLines({});
    setExchangeItems([]);
    setReason('');
    setNote('');
    setTenderAmount('');
    lookup.refetch();
    setActiveReceipt({ id: created.id, record: created });
  };

  const historyItems = historyList.data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((historyList.data?.meta?.total ?? 0) / PAGE_SIZE));
  const branchOptions = branches.data ?? [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('returns.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('returns.description')}</p>
        </div>
      </header>

      {canCreate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('returns.lookup.title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <form onSubmit={handleFindOrder} className="flex flex-wrap items-end gap-3">
              <label className="grid flex-1 min-w-64 gap-1 text-sm">
                {t('returns.lookup.orderLabel')}
                <Input
                  value={orderInput}
                  placeholder={t('returns.lookup.orderPlaceholder')}
                  onChange={(e) => setOrderInput(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={lookup.isFetching || !orderInput.trim()}>
                {lookup.isFetching ? t('common.loading') : t('returns.lookup.findButton')}
              </Button>
            </form>

            {lookup.isError && <Alert variant="destructive">{errorMessage(t, lookup.error)}</Alert>}

            {loadedOrder && (
              <form onSubmit={handleSubmit} className="grid gap-6 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-semibold">{loadedOrder.orderNo}</span>
                    <Badge tone="neutral">{loadedOrder.status}</Badge>
                    {loadedOrder.customer?.name && (
                      <span>
                        {loadedOrder.customer.name} ({loadedOrder.customer.phone})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('returns.lookup.orderTotal')}:</span>
                    <span className="font-semibold tabular-nums">
                      {fmt.money(loadedOrder.totals?.total ?? 0)}
                    </span>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={t('returns.mode.label')}
                >
                  <Button
                    type="button"
                    variant={mode === 'return' ? 'default' : 'outline'}
                    onClick={() => setMode('return')}
                  >
                    {t('returns.mode.return')}
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'exchange' ? 'default' : 'outline'}
                    onClick={() => setMode('exchange')}
                  >
                    {t('returns.mode.exchange')}
                  </Button>
                </div>

                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">{t('returns.lines.heading')}</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('returns.lines.item')}</TableHead>
                          <TableHead className="text-end">{t('returns.lines.unitPrice')}</TableHead>
                          <TableHead className="text-end">{t('returns.lines.soldQty')}</TableHead>
                          <TableHead className="text-end">
                            {t('returns.lines.returnableQty')}
                          </TableHead>
                          <TableHead className="w-28">{t('returns.lines.returnQty')}</TableHead>
                          <TableHead className="w-48">{t('returns.lines.disposition')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => {
                          const sel = selectedLines[item.variantId] ?? {
                            qty: 0,
                            disposition: 'restock',
                          };
                          return (
                            <TableRow key={item.variantId}>
                              <TableCell>
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {item.sku}
                                </div>
                              </TableCell>
                              <TableCell className="text-end tabular-nums">
                                {fmt.money(item.unitPrice)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums">
                                {fmt.number(item.qty)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums">
                                {fmt.number(item.returnableQty)}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  max={item.returnableQty}
                                  disabled={item.returnableQty === 0}
                                  aria-label={t('returns.lines.returnQtyFor', { name: item.name })}
                                  value={sel.qty}
                                  onChange={(e) =>
                                    setLineQty(item.variantId, e.target.value, item.returnableQty)
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  disabled={item.returnableQty === 0 || sel.qty === 0}
                                  aria-label={t('returns.lines.dispositionFor', {
                                    name: item.name,
                                  })}
                                  value={sel.disposition}
                                  onChange={(e) =>
                                    setLineDisposition(item.variantId, e.target.value)
                                  }
                                >
                                  {RETURN_EXCHANGE.DISPOSITIONS.map((d) => (
                                    <option key={d} value={d}>
                                      {t(`returns.disposition.${d}`)}
                                    </option>
                                  ))}
                                </Select>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {mode === 'exchange' && (
                  <div className="grid gap-3 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">{t('returns.exchange.heading')}</h3>
                    <label className="grid gap-1 text-sm">
                      {t('returns.exchange.searchLabel')}
                      <Input
                        value={productQuery}
                        placeholder={t('returns.exchange.searchPlaceholder')}
                        onChange={(e) => setProductQuery(e.target.value)}
                      />
                    </label>
                    {tillSearch.data?.length > 0 && (
                      <div className="grid gap-1 rounded-md border bg-muted/20 p-2">
                        {tillSearch.data.map((hit) => (
                          <div
                            key={hit.variantId}
                            className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <div>
                              <span className="font-medium">{hit.name}</span>{' '}
                              <span className="font-mono text-xs text-muted-foreground">
                                ({hit.sku})
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums">{fmt.money(hit.price)}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => addExchangeItem(hit)}
                              >
                                {t('returns.exchange.addItem')}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {exchangeItems.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('returns.lines.item')}</TableHead>
                              <TableHead className="text-end">
                                {t('returns.lines.unitPrice')}
                              </TableHead>
                              <TableHead className="w-28">{t('returns.exchange.qty')}</TableHead>
                              <TableHead className="text-end">
                                {t('returns.exchange.lineTotal')}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {exchangeItems.map((item) => (
                              <TableRow key={item.variantId}>
                                <TableCell>
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-xs font-mono text-muted-foreground">
                                    {item.sku}
                                  </div>
                                </TableCell>
                                <TableCell className="text-end tabular-nums">
                                  {fmt.money(item.unitPrice)}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    aria-label={t('returns.exchange.qtyFor', { name: item.name })}
                                    value={item.qty}
                                    onChange={(e) =>
                                      updateExchangeQty(
                                        item.variantId,
                                        Number.parseInt(e.target.value || '0', 10) || 0,
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-end tabular-nums">
                                  {fmt.money(item.unitPrice * item.qty)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {activeReturnLines.length > 0 && exchangeItems.length > 0 && shortfall > 0 && (
                      <Alert variant="destructive">
                        {t('returns.exchange.shortfallWarning', {
                          credit: fmt.money(returnCredit),
                          replacement: fmt.money(exchangeTotal),
                          shortfall: fmt.money(shortfall),
                        })}
                      </Alert>
                    )}
                  </div>
                )}

                {createReturn.isError && (
                  <Alert variant="destructive">{errorMessage(t, createReturn.error)}</Alert>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-3 content-start">
                    {mode === 'return' ? (
                      <label className="grid gap-1 text-sm">
                        {t('returns.fields.refundMethod')}
                        <Select
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value)}
                        >
                          {RETURN_EXCHANGE.REFUND_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {t(`returns.refundMethod.${m}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : (
                      differenceDue > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm">
                            {t('returns.exchange.paymentMethod')}
                            <Select
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value)}
                            >
                              {paymentMethods.map((m) => (
                                <option key={m.key} value={m.key}>
                                  {m.label ?? m.key}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="grid gap-1 text-sm">
                            {t('returns.exchange.amountTendered')}
                            <MoneyInput
                              value={tenderAmount}
                              placeholder={(differenceDue / 100).toFixed(2)}
                              onChange={(e) => setTenderAmount(e.target.value)}
                            />
                          </label>
                        </div>
                      )
                    )}

                    <label className="grid gap-1 text-sm">
                      {t('returns.fields.reason')}
                      <PlainTextInput
                        value={reason}
                        maxLength={240}
                        placeholder={t('returns.fields.reasonPlaceholder')}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm content-between">
                    <div className="grid gap-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t('returns.fields.returnCredit')}
                        </span>
                        <span className="tabular-nums font-medium">{fmt.money(returnCredit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t('returns.fields.vatReversed')}
                        </span>
                        <span className="tabular-nums">{fmt.money(pricedReturn.totals.vat)}</span>
                      </div>
                      {mode === 'exchange' ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t('returns.fields.exchangeTotal')}
                            </span>
                            <span className="tabular-nums font-medium">
                              {fmt.money(exchangeTotal)}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <span>{t('returns.fields.differenceDue')}</span>
                            <span className="tabular-nums">{fmt.money(differenceDue)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between border-t pt-2 font-semibold">
                          <span>{t('returns.fields.refundAmount')}</span>
                          <span className="tabular-nums">{fmt.money(returnCredit)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={
                          createReturn.isPending || activeReturnLines.length === 0 || !exchangeValid
                        }
                      >
                        {createReturn.isPending
                          ? t('common.saving')
                          : mode === 'exchange'
                            ? t('returns.submitExchange')
                            : t('returns.submitReturn')}
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">{t('returns.history.title')}</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="w-44"
              aria-label={t('returns.history.branchFilter')}
              value={filterBranch}
              onChange={(e) => go({ branchId: e.target.value || undefined, page: 1 })}
            >
              <option value="">{t('returns.history.allBranches')}</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name?.en ?? b.code}
                </option>
              ))}
            </Select>
            <Select
              className="w-40"
              aria-label={t('returns.history.typeFilter')}
              value={filterType}
              onChange={(e) => go({ type: e.target.value || undefined, page: 1 })}
            >
              <option value="">{t('returns.history.allTypes')}</option>
              <option value="return">{t('returns.type.return')}</option>
              <option value="exchange">{t('returns.type.exchange')}</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {historyList.isPending ? (
            <Skeleton className="h-48" />
          ) : historyItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('returns.history.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('returns.fields.returnNo')}</TableHead>
                    <TableHead>{t('returns.fields.type')}</TableHead>
                    <TableHead>{t('returns.fields.orderNo')}</TableHead>
                    <TableHead className="text-end">{t('returns.fields.returnCredit')}</TableHead>
                    <TableHead className="text-end">{t('returns.fields.settlement')}</TableHead>
                    <TableHead>{t('returns.fields.createdAt')}</TableHead>
                    <TableHead className="text-end">{t('returns.history.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono font-medium">{row.returnNo}</TableCell>
                      <TableCell>
                        <Badge tone={row.type === 'exchange' ? 'info' : 'warning'}>
                          {t(`returns.type.${row.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{row.orderNo}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt.money(row.returnTotals?.total ?? 0)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {row.type === 'exchange'
                          ? `+${fmt.money(row.differenceDue ?? 0)}`
                          : `-${fmt.money(row.refundAmount ?? 0)}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmt.dateTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveReceipt({ id: row.id, record: row })}
                        >
                          {t('returns.history.viewReceipt')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination page={page} pages={totalPages} onPage={(p) => go({ page: p })} />
        </CardContent>
      </Card>

      <ReturnReceiptDialog
        open={Boolean(activeReceipt)}
        onOpenChange={(open) => {
          if (!open) setActiveReceipt(null);
        }}
        returnId={activeReceipt?.id}
        initialRecord={activeReceipt?.record ?? null}
      />
    </div>
  );
}
