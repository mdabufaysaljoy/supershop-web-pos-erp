import { formatMoney, sumMinor } from '../money.js';
import { renderTemplate } from '../printing/template.js';

/**
 * Cashier shifts, cash movements, X-Reports & Z-Reports (P6.5).
 *
 * All money is in integer halalas. Pure summary maths so the API, live X-Report, closed Z-Report,
 * thermal print job, and admin close-shift dialog all agree on the exact halala in the drawer.
 */
export const SHIFT = Object.freeze({
  STATUSES: Object.freeze(['open', 'closed']),
  MOVEMENT_TYPES: Object.freeze(['in', 'out']),
  NUMBER_PREFIX: 'SHF-',
  Z_REPORT_PREFIX: 'Z-',
  MAX_MOVEMENTS: 200,
});

const isCashTender = (p) => p?.methodType === 'cash' || p?.method === 'cash';

/**
 * Summarizes a shift's cash movements, POS sales, payment tenders, expected drawer cash, and
 * closing discrepancy.
 *
 * @param {{
 *   openingCash?: number,
 *   closingCash?: number | null,
 *   movements?: Array<{ type: 'in' | 'out', amount: number, reason?: string, at?: string | Date, staffName?: string }>,
 *   orders?: Array<{
 *     status?: string,
 *     totals?: { itemCount?: number, subtotal?: number, discountTotal?: number, net?: number, vat?: number, total?: number },
 *     payment?: { method?: string, methodType?: string, label?: string, refundedAmount?: number },
 *     payments?: Array<{ method: string, methodType?: string, label?: string | null, amount: number }>,
 *     changeGiven?: number,
 *   }>
 * }} input
 */
export function summarizeShift({
  openingCash = 0,
  closingCash = null,
  movements = [],
  orders = [],
} = {}) {
  const cashIn = sumMinor(0, ...movements.filter((m) => m.type === 'in').map((m) => m.amount ?? 0));
  const cashOut = sumMinor(
    0,
    ...movements.filter((m) => m.type === 'out').map((m) => m.amount ?? 0),
  );
  const netCashMovements = cashIn - cashOut;

  // Exclude cancelled orders from shift sales totals.
  const activeOrders = orders.filter((o) => o && o.status !== 'cancelled');

  const saleCount = activeOrders.length;
  const itemCount = sumMinor(0, ...activeOrders.map((o) => o.totals?.itemCount ?? 0));
  const subtotal = sumMinor(0, ...activeOrders.map((o) => o.totals?.subtotal ?? 0));
  const discountTotal = sumMinor(0, ...activeOrders.map((o) => o.totals?.discountTotal ?? 0));
  const net = sumMinor(0, ...activeOrders.map((o) => o.totals?.net ?? 0));
  const vat = sumMinor(0, ...activeOrders.map((o) => o.totals?.vat ?? 0));
  const total = sumMinor(0, ...activeOrders.map((o) => o.totals?.total ?? 0));

  /** @type {Map<string, { method: string, methodType: string, label: string, count: number, tendered: number, changeGiven: number, netAmount: number }>} */
  const methodMap = new Map();

  for (const order of activeOrders) {
    const tenders =
      order.payments?.length > 0
        ? order.payments
        : order.payment?.method
          ? [
              {
                method: order.payment.method,
                methodType: order.payment.methodType ?? 'offline',
                label: order.payment.label ?? order.payment.method,
                amount: order.totals?.total ?? 0,
              },
            ]
          : [];

    let remainingChange = order.changeGiven ?? 0;
    // Change is handed out from the cash tender (last cash tender first, matching pos.service.js).
    const cashIndices = tenders
      .map((t, idx) => (isCashTender(t) ? idx : -1))
      .filter((idx) => idx >= 0);
    const changeTargetIdx = cashIndices.at(-1) ?? -1;

    for (const [idx, tender] of tenders.entries()) {
      const key = tender.method;
      const existing = methodMap.get(key) ?? {
        method: key,
        methodType: tender.methodType ?? (key === 'cash' ? 'cash' : 'offline'),
        label: tender.label || key,
        count: 0,
        tendered: 0,
        changeGiven: 0,
        netAmount: 0,
      };
      const changeForThis = idx === changeTargetIdx ? remainingChange : 0;
      if (idx === changeTargetIdx) remainingChange = 0;

      existing.count += 1;
      existing.tendered = sumMinor(existing.tendered, tender.amount ?? 0);
      existing.changeGiven = sumMinor(existing.changeGiven, changeForThis);
      existing.netAmount = existing.tendered - existing.changeGiven;
      methodMap.set(key, existing);
    }
  }

  const byMethod = [...methodMap.values()];
  const cashSales = sumMinor(0, ...byMethod.filter((m) => isCashTender(m)).map((m) => m.netAmount));
  const expectedCash = openingCash + cashSales + netCashMovements;
  const counted = closingCash == null ? null : closingCash;
  const discrepancy = counted == null ? null : counted - expectedCash;

  return {
    openingCash,
    cashSales,
    cashIn,
    cashOut,
    netCashMovements,
    movementCount: movements.length,
    expectedCash,
    closingCash: counted,
    discrepancy,
    sales: {
      count: saleCount,
      itemCount,
      subtotal,
      discountTotal,
      net,
      vat,
      total,
    },
    byMethod,
  };
}

/**
 * Formats a shift + its summary into template data for thermal X-Report or Z-Report printing.
 *
 * @param {object} shift
 * @param {{ kind?: 'x' | 'z', shop?: object, currency?: string, lang?: string, timeZone?: string }} [ctx]
 */
export function shiftReportData(
  shift,
  { kind = 'x', shop = {}, currency = 'SAR', lang = 'en', timeZone = 'Asia/Riyadh' } = {},
) {
  const isZ = kind === 'z';
  const summary =
    shift.summary ??
    summarizeShift({
      openingCash: shift.openingCash,
      closingCash: shift.closingCash,
      movements: shift.movements ?? [],
      orders: shift.orders ?? [],
    });

  const money = (amount) => formatMoney(amount ?? 0, { currency, lang });
  const signedMoney = (amount) => {
    const val = amount ?? 0;
    if (val === 0) return money(0);
    return val > 0 ? `+${money(val)}` : `-${money(Math.abs(val))}`;
  };
  const when = (value) => {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(`${lang}-SA`, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone,
          numberingSystem: 'latn',
          calendar: 'gregory',
        }).format(date);
  };

  return {
    shop: {
      name: shop.name ?? '',
      vatNumber: shop.vatNumber ?? '',
    },
    report: {
      title: isZ ? 'Z-REPORT (END OF SHIFT)' : 'X-REPORT (MID-SHIFT)',
      kind: isZ ? 'Z' : 'X',
      zReportNo: shift.zReportNo ?? '',
      shiftNo: shift.shiftNo ?? '',
      branch: shift.branchName ?? '',
      openedBy: shift.openedByName ?? '',
      closedBy: shift.closedByName ?? '',
      openedAt: when(shift.openedAt),
      closedAt: when(shift.closedAt ?? new Date()),
      openNote: shift.openNote ?? '',
      closeNote: shift.closeNote ?? '',
    },
    sales: {
      count: String(summary.sales.count),
      itemCount: String(summary.sales.itemCount),
      subtotal: money(summary.sales.subtotal),
      discount: money(summary.sales.discountTotal),
      net: money(summary.sales.net),
      vat: money(summary.sales.vat),
      total: money(summary.sales.total),
    },
    drawer: {
      openingCash: money(summary.openingCash),
      cashSales: money(summary.cashSales),
      cashIn: money(summary.cashIn),
      cashOut: money(summary.cashOut),
      expectedCash: money(summary.expectedCash),
      closingCash: summary.closingCash == null ? '-' : money(summary.closingCash),
      discrepancy: summary.discrepancy == null ? '-' : signedMoney(summary.discrepancy),
    },
    payments: (summary.byMethod ?? []).map((m) => ({
      label: `${m.label || m.method} (${m.count})`,
      amount: money(m.netAmount),
    })),
    items: (shift.movements ?? []).map((m) => ({
      name: `${m.type === 'in' ? 'IN' : 'OUT'}: ${m.reason ?? ''}`.trim(),
      lineTotal: m.type === 'in' ? `+${money(m.amount)}` : `-${money(m.amount)}`,
    })),
    raw: {
      vatNumber: shop.vatNumber ?? '',
      zReportNo: shift.zReportNo ?? '',
      closedBy: shift.closedByName ?? '',
      discount: summary.sales.discountTotal ?? 0,
      cashIn: summary.cashIn ?? 0,
      cashOut: summary.cashOut ?? 0,
      hasPayments: (summary.byMethod?.length ?? 0) > 0 ? 1 : 0,
      hasMovements: (shift.movements?.length ?? 0) > 0 ? 1 : 0,
      isZ: isZ ? 1 : 0,
      closeNote: shift.closeNote ?? '',
    },
  };
}

/**
 * Builds the ESC/POS template block list for an X-Report or Z-Report.
 *
 * @param {{ kind?: 'x' | 'z' }} [opts]
 */
export function buildShiftReportTemplate({ kind = 'x' } = {}) {
  const isZ = kind === 'z';
  return [
    { type: 'text', value: '{{shop.name}}', align: 'center', bold: true, size: 'double' },
    { type: 'text', value: 'VAT: {{shop.vatNumber}}', align: 'center', showIf: 'raw.vatNumber' },
    { type: 'text', value: '{{report.title}}', align: 'center', bold: true },
    {
      type: 'row',
      left: 'Z-Report #',
      right: '{{report.zReportNo}}',
      bold: true,
      showIf: 'raw.zReportNo',
    },
    { type: 'rule' },
    { type: 'row', left: 'Shift', right: '{{report.shiftNo}}' },
    { type: 'row', left: 'Branch', right: '{{report.branch}}' },
    { type: 'row', left: 'Opened by', right: '{{report.openedBy}}' },
    { type: 'row', left: 'Opened at', right: '{{report.openedAt}}' },
    {
      type: 'row',
      left: isZ ? 'Closed by' : 'Printed at',
      right: isZ ? '{{report.closedBy}}' : '{{report.closedAt}}',
    },
    ...(isZ ? [{ type: 'row', left: 'Closed at', right: '{{report.closedAt}}' }] : []),
    { type: 'rule' },
    { type: 'text', value: 'SALES SUMMARY', bold: true },
    { type: 'row', left: 'Sales count', right: '{{sales.count}}' },
    { type: 'row', left: 'Items sold', right: '{{sales.itemCount}}' },
    { type: 'row', left: 'Subtotal', right: '{{sales.subtotal}}' },
    { type: 'row', left: 'Discounts', right: '-{{sales.discount}}', showIf: 'raw.discount' },
    { type: 'row', left: 'Net (excl. VAT)', right: '{{sales.net}}' },
    { type: 'row', left: 'VAT', right: '{{sales.vat}}' },
    { type: 'row', left: 'Total sales', right: '{{sales.total}}', bold: true },
    { type: 'rule', showIf: 'raw.hasPayments' },
    { type: 'text', value: 'TENDERS BY METHOD', bold: true, showIf: 'raw.hasPayments' },
    {
      type: 'payments',
      line: { type: 'row', left: '{{label}}', right: '{{amount}}' },
      showIf: 'raw.hasPayments',
    },
    { type: 'rule' },
    { type: 'text', value: 'CASH DRAWER', bold: true },
    { type: 'row', left: 'Opening float', right: '{{drawer.openingCash}}' },
    { type: 'row', left: 'Cash sales (net)', right: '{{drawer.cashSales}}' },
    { type: 'row', left: 'Cash in', right: '+{{drawer.cashIn}}', showIf: 'raw.cashIn' },
    { type: 'row', left: 'Cash out', right: '-{{drawer.cashOut}}', showIf: 'raw.cashOut' },
    { type: 'row', left: 'Expected cash', right: '{{drawer.expectedCash}}', bold: true },
    ...(isZ
      ? [
          { type: 'row', left: 'Counted cash', right: '{{drawer.closingCash}}', bold: true },
          { type: 'row', left: 'Discrepancy', right: '{{drawer.discrepancy}}', bold: true },
        ]
      : []),
    { type: 'rule', showIf: 'raw.hasMovements' },
    { type: 'text', value: 'CASH MOVEMENTS', bold: true, showIf: 'raw.hasMovements' },
    {
      type: 'items',
      line: { type: 'row', left: '{{name}}', right: '{{lineTotal}}' },
      showIf: 'raw.hasMovements',
    },
    { type: 'text', value: '{{report.closeNote}}', align: 'center', showIf: 'raw.closeNote' },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ];
}

/**
 * Renders an X-Report or Z-Report directly to ESC/POS bytes.
 */
export function renderShiftReport(
  shift,
  {
    kind = 'x',
    widthMm = 80,
    shop = {},
    currency = 'SAR',
    lang = 'en',
    timeZone = 'Asia/Riyadh',
  } = {},
) {
  const data = shiftReportData(shift, { kind, shop, currency, lang, timeZone });
  const tpl = buildShiftReportTemplate({ kind });
  return renderTemplate(tpl, data, { widthMm });
}
