/**
 * Credit passport — a trustworthy, shareable summary derived only from the owner's own data.
 * Includes turnover, cash-flow stability, continuous-record length, and the declared asset base
 * as a collateral signal. Sharing is consent-gated (enforced by the caller / API).
 */

import { assetSummary, type AssetSummary } from "./assets.js";
import { OfficialRateTable, translate } from "./fx.js";
import { add, fromScaled, toScaled } from "./money.js";
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
  avgMonthlyTurnover: string;
  cashFlowStability: Stability;
  continuousRecordDays: number;
  declaredAssetBase: AssetSummary;
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

/** Coefficient of variation of monthly turnover, bucketed into three explainable bands. */
function stabilityFromMonthly(monthlyTotals: number[]): Stability {
  if (monthlyTotals.length < 2) return "VARIABLE";
  const mean =
    monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length;
  if (mean === 0) return "VARIABLE";
  const variance =
    monthlyTotals.reduce((a, b) => a + (b - mean) ** 2, 0) /
    monthlyTotals.length;
  const cv = Math.sqrt(variance) / mean;
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

  if (income.length === 0) {
    return {
      periodCovered: null,
      totalTurnover: "0",
      avgMonthlyTurnover: "0",
      cashFlowStability: "VARIABLE",
      continuousRecordDays: 0,
      declaredAssetBase: assets,
      currency,
      generatedAt: now,
    };
  }

  const dates = income.map((t) => t.date).sort();
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  // Turnover in reporting currency + per-month buckets.
  let totalTurnover = "0";
  const monthly = new Map<string, string>();
  for (const t of income) {
    const val = translate(t, currency, basis, rates).value;
    totalTurnover = add(totalTurnover, val);
    const k = monthKey(t.date);
    monthly.set(k, add(monthly.get(k) ?? "0", val));
  }

  const monthCount = Math.max(1, monthly.size);
  const avgMonthlyTurnover = fromScaled(
    toScaled(totalTurnover) / BigInt(monthCount),
  );

  const monthlyNumbers = [...monthly.values()].map((v) => Number(v));
  const stability = stabilityFromMonthly(monthlyNumbers);

  return {
    periodCovered: { from, to },
    totalTurnover,
    avgMonthlyTurnover,
    cashFlowStability: stability,
    continuousRecordDays: daysBetween(from, to),
    declaredAssetBase: assets,
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
