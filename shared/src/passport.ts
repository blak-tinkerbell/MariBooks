/**
 * Credit passport — a trustworthy, shareable summary derived only from the owner's own data.
 * Includes turnover, cash-flow stability, continuous-record length, and the declared asset base
 * as a collateral signal. Sharing is consent-gated (enforced by the caller / API).
 */

import { assetSummary, type AssetSummary } from "./assets.js";
import { OfficialRateTable, translate } from "./fx.js";
import { add, fromScaled, toScaled } from "./money.js";
import { getDashboard } from "./reporting.js";
import type {
  Currency,
  ISODate,
  RateBasis,
  ShareLink,
  Transaction,
} from "./types.js";

export type Stability = "STRONG" | "MODERATE" | "VARIABLE";

export interface Passport {
  periodCovered: { from: ISODate; to: ISODate } | null;
  totalTurnover: string; // verified = sum of captured money-in, in reporting currency
  avgMonthlyTurnover: string; // totalTurnover / months spanned by the record (incl. empty months)
  totalMoneyOut: string; // operating money-out over the period (assets excluded), reporting currency
  netProfit: string; // totalTurnover - totalMoneyOut; may be negative
  cashFlowStability: Stability;
  recordSpanDays: number; // calendar days from first to last income entry (span, not continuity)
  activeMonths: number; // distinct months that actually have income
  monthsInPeriod: number; // calendar months the record spans, empty months included
  hasContinuousMonths: boolean; // true when every month in the span has at least one income entry
  declaredAssetBase: AssetSummary;
  assetsAcquiredFrom: ISODate | null; // earliest asset acquisition date
  assetsAcquiredTo: ISODate | null; // latest asset acquisition date
  currency: Currency;
  generatedAt: ISODate;
}

function monthKey(date: ISODate): string {
  return date.slice(0, 7); // yyyy-mm
}

function daysBetween(from: ISODate, to: ISODate): number {
  const a = Date.parse(from.slice(0, 10));
  const b = Date.parse(to.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Count of calendar months spanned by [from, to] inclusive, counting empty months. */
function monthsSpanned(from: ISODate, to: ISODate): number {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 1;
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * Coefficient of variation of monthly turnover, bucketed into three explainable bands.
 * Operates on scaled minor units (BigInt) so money never passes through a binary float; only
 * the final dimensionless ratio uses floating point.
 */
function stabilityFromMonthly(monthlyTotals: bigint[]): Stability {
  const n = monthlyTotals.length;
  if (n < 2) return "VARIABLE";
  const count = BigInt(n);
  const total = monthlyTotals.reduce((a, b) => a + b, 0n);
  if (total === 0n) return "VARIABLE";
  const meanScaled = total / count; // minor units
  // Variance in (minor units)^2, kept in BigInt; mean of squared deviations.
  const varianceScaled =
    monthlyTotals.reduce((a, b) => {
      const d = b - meanScaled;
      return a + d * d;
    }, 0n) / count;
  // cv = sqrt(variance) / mean. Both share the same scale, so the ratio is scale-free.
  const cv = Math.sqrt(Number(varianceScaled)) / Number(meanScaled);
  if (cv <= 0.25) return "STRONG";
  if (cv <= 0.6) return "MODERATE";
  return "VARIABLE";
}

export function getPassport(
  txns: Transaction[],
  currency: Currency,
  basis: RateBasis = "EFFECTIVE",
  rates: OfficialRateTable = new OfficialRateTable(),
  now: ISODate = new Date().toISOString(),
): Passport {
  const income = txns.filter((t) => t.direction === "IN");
  const assets = assetSummary(txns, currency, basis, rates);
  const assetDates = txns
    .filter((t) => t.direction === "OUT" && t.isAsset && t.assetClass)
    .map((t) => t.date)
    .sort();
  const assetsAcquiredFrom = assetDates[0] ?? null;
  const assetsAcquiredTo = assetDates[assetDates.length - 1] ?? null;

  if (income.length === 0) {
    return {
      periodCovered: null,
      totalTurnover: "0",
      avgMonthlyTurnover: "0",
      totalMoneyOut: "0",
      netProfit: "0",
      cashFlowStability: "VARIABLE",
      recordSpanDays: 0,
      activeMonths: 0,
      monthsInPeriod: 0,
      hasContinuousMonths: false,
      declaredAssetBase: assets,
      assetsAcquiredFrom,
      assetsAcquiredTo,
      currency,
      generatedAt: now,
    };
  }

  const dates = income.map((t) => t.date).sort();
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  // The reporting window for costs/profit spans ALL activity, not just income dates, so an
  // expense recorded before the first sale or after the last is never silently dropped.
  const allDates = txns.map((t) => t.date).sort();
  const activityFrom = allDates[0]!;
  const activityTo = allDates[allDates.length - 1]!;

  // Turnover in reporting currency + per-month buckets (scaled minor units).
  let totalScaled = 0n;
  const monthly = new Map<string, bigint>();
  for (const t of income) {
    const scaled = toScaled(translate(t, currency, basis, rates).value);
    totalScaled += scaled;
    const k = monthKey(t.date);
    monthly.set(k, (monthly.get(k) ?? 0n) + scaled);
  }
  const totalTurnover = fromScaled(totalScaled);

  // Average over the full span (empty months included), so a quiet month isn't hidden.
  const monthsInPeriod = monthsSpanned(from, to);
  const activeMonths = monthly.size;
  const avgMonthlyTurnover = fromScaled(totalScaled / BigInt(monthsInPeriod));
  const hasContinuousMonths = activeMonths === monthsInPeriod;

  const stability = stabilityFromMonthly([...monthly.values()]);

  // Money-out and net profit come from the shared reporting engine (assets excluded from
  // profit), so the passport and the dashboard/statement always agree. Scoped to the full
  // activity span so costs outside the income window still count.
  const dash = getDashboard(txns, { from: activityFrom, to: activityTo }, currency, basis, rates);

  return {
    periodCovered: { from, to },
    totalTurnover,
    avgMonthlyTurnover,
    totalMoneyOut: dash.operatingOut,
    netProfit: dash.profit,
    cashFlowStability: stability,
    recordSpanDays: daysBetween(from, to),
    activeMonths,
    monthsInPeriod,
    hasContinuousMonths,
    declaredAssetBase: assets,
    assetsAcquiredFrom,
    assetsAcquiredTo,
    currency,
    generatedAt: now,
  };
}

export class ConsentError extends Error {}

/**
 * Create a consent-gated share of a passport (or statement). Throws unless the caller passes an
 * explicit consent acknowledgement. The returned ShareLink records exactly which transactions
 * were included, so those records can be locked against edit/delete while the share is active.
 *
 * Persistence (writing the ShareLink, exposing the public token) is the caller's / API's job;
 * this function keeps the domain rule — no share without consent — pure and testable.
 */
export function sharePassport(
  args: {
    id: string;
    consentAck: boolean;
    currency: Currency;
    basis?: RateBasis;
    transactionIds: string[];
    note?: string;
  },
  now: ISODate = new Date().toISOString(),
): ShareLink {
  if (args.consentAck !== true) {
    throw new ConsentError("Sharing requires explicit consent");
  }
  return {
    id: args.id,
    kind: "PASSPORT",
    consentAck: true,
    createdAt: now,
    currency: args.currency,
    basis: args.basis ?? "EFFECTIVE",
    transactionIds: [...args.transactionIds],
    note: args.note,
  };
}

/** Revoke a share. Idempotent: revoking an already-revoked link keeps the original timestamp. */
export function revokeShare(
  link: ShareLink,
  now: ISODate = new Date().toISOString(),
): ShareLink {
  if (link.revokedAt) return link;
  return { ...link, revokedAt: now };
}

/** True while a share has not been revoked. */
export function isActiveShare(link: ShareLink): boolean {
  return !link.revokedAt;
}

/** The set of transaction ids currently locked by any active share. */
export function lockedTransactionIds(links: ShareLink[]): Set<string> {
  const locked = new Set<string>();
  for (const link of links) {
    if (isActiveShare(link)) {
      for (const id of link.transactionIds) locked.add(id);
    }
  }
  return locked;
}
