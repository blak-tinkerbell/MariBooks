/**
 * Reporting — dashboard and lender-ready statement.
 *
 * All figures are produced in a chosen reporting currency and rate basis (EFFECTIVE default;
 * OFFICIAL for statutory-styled reports). Asset purchases are excluded from profit and reported
 * separately as capital (Req 9.2). Captured data is never rewritten.
 */

import { OfficialRateTable, translate, type TranslationResult } from "./fx.js";
import { add, subtract, sum } from "./money.js";
import type {
  AssetClass,
  Category,
  Currency,
  ISODate,
  Rail,
  RateBasis,
  Transaction,
} from "./types.js";

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

function inRange(txn: Transaction, range: DateRange): boolean {
  return txn.date >= range.from && txn.date <= range.to;
}

function toReporting(
  txn: Transaction,
  currency: Currency,
  basis: RateBasis,
  rates: OfficialRateTable,
): TranslationResult {
  return translate(txn, currency, basis, rates);
}

/** Total money leaving a transaction (principal + fee + imtt), in original currency. */
function outflow(txn: Transaction): string {
  return add(add(txn.amount, txn.fee ?? "0"), txn.imtt ?? "0");
}

export interface DashboardResult {
  currency: Currency;
  basis: RateBasis;
  moneyIn: string;
  operatingOut: string;
  profit: string; // moneyIn - operatingOut (assets excluded)
  assetSpend: string; // capital out, reported separately
  cashByRail: Record<string, string>; // net position per rail (includes assets & fees)
  plainLanguageSummary: string;
  note?: string;
}

export function getDashboard(
  txns: Transaction[],
  range: DateRange,
  currency: Currency,
  basis: RateBasis = "EFFECTIVE",
  rates: OfficialRateTable = new OfficialRateTable(),
): DashboardResult {
  const scoped = txns.filter((t) => inRange(t, range));
  const ins: string[] = [];
  const opOut: string[] = [];
  const assetOut: string[] = [];
  const cashByRail: Record<string, string> = {};
  let note: string | undefined;

  for (const t of scoped) {
    const tr = toReporting(t, currency, basis, rates);
    if (tr.note) note = tr.note;

    if (t.direction === "IN") {
      ins.push(tr.value);
      cashByRail[t.rail] = add(cashByRail[t.rail] ?? "0", tr.value);
    } else {
      // For OUT, translate the full outflow (principal + fee + imtt) for cash-by-rail,
      // but profit uses principal only (fees are expenses too, kept simple here: principal+fees
      // reduce profit for operating; assets excluded from profit entirely).
      const fullOut = toReporting(
        { ...t, amount: outflow(t) },
        currency,
        basis,
        rates,
      ).value;
      cashByRail[t.rail] = subtract(cashByRail[t.rail] ?? "0", fullOut);
      if (t.isAsset) {
        assetOut.push(tr.value); // capital: principal in reporting currency
      } else {
        opOut.push(fullOut); // operating expense incl. fees/imtt
      }
    }
  }

  const moneyIn = sum(ins);
  const operatingOut = sum(opOut);
  const assetSpend = sum(assetOut);
  const profit = subtract(moneyIn, operatingOut);

  return {
    currency,
    basis,
    moneyIn,
    operatingOut,
    profit,
    assetSpend,
    cashByRail,
    plainLanguageSummary: plainSummary(profit, currency),
    note,
  };
}

function plainSummary(profit: string, currency: Currency): string {
  const positive = !profit.startsWith("-");
  const magnitude = profit.replace("-", "");
  return positive
    ? `You made ${magnitude} ${currency} this period.`
    : `You spent ${magnitude} ${currency} more than you earned this period.`;
}

export interface StatementResult {
  business: { name: string; tin?: string };
  period: DateRange;
  currency: Currency;
  basis: RateBasis;
  totals: {
    moneyIn: string;
    operatingOut: string;
    netProfit: string;
    assetSpend: string;
  };
  byCategory: Partial<Record<Category, { in: string; out: string }>>;
  byRail: Partial<Record<Rail, { in: string; out: string }>>;
  assetsAcquired: Partial<Record<AssetClass, { count: number; value: string }>>;
  note?: string;
  generatedAt: ISODate;
}

export function getStatement(
  txns: Transaction[],
  range: DateRange,
  business: { name: string; tin?: string },
  currency: Currency,
  basis: RateBasis = "EFFECTIVE",
  rates: OfficialRateTable = new OfficialRateTable(),
  now: ISODate = new Date().toISOString(),
): StatementResult {
  const scoped = txns.filter((t) => inRange(t, range));
  const dash = getDashboard(txns, range, currency, basis, rates);

  const byCategory: Partial<Record<Category, { in: string; out: string }>> = {};
  const byRail: Partial<Record<Rail, { in: string; out: string }>> = {};
  const assetsAcquired: Partial<
    Record<AssetClass, { count: number; value: string }>
  > = {};

  for (const t of scoped) {
    const val = toReporting(t, currency, basis, rates).value;
    const cat = (byCategory[t.category] ??= { in: "0", out: "0" });
    const rail = (byRail[t.rail] ??= { in: "0", out: "0" });
    if (t.direction === "IN") {
      cat.in = add(cat.in, val);
      rail.in = add(rail.in, val);
    } else {
      cat.out = add(cat.out, val);
      rail.out = add(rail.out, val);
      if (t.isAsset && t.assetClass) {
        const a = (assetsAcquired[t.assetClass] ??= { count: 0, value: "0" });
        a.count += 1;
        a.value = add(a.value, val);
      }
    }
  }

  return {
    business,
    period: range,
    currency,
    basis,
    totals: {
      moneyIn: dash.moneyIn,
      operatingOut: dash.operatingOut,
      netProfit: dash.profit,
      assetSpend: dash.assetSpend,
    },
    byCategory,
    byRail,
    assetsAcquired,
    note: dash.note,
    generatedAt: now,
  };
}
