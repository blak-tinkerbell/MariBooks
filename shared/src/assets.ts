/**
 * Asset register — a projection over transactions flagged `isAsset`.
 *
 * The declared asset base is owner-declared acquisition cost, NOT a verified market/collateral
 * valuation (Req 9.5). It feeds the credit passport as a collateral signal.
 */

import { OfficialRateTable, translate } from "./fx.js";
import { add } from "./money.js";
import type {
  AssetClass,
  Currency,
  ISODate,
  RateBasis,
  Transaction,
} from "./types.js";

export interface AssetItem {
  transactionId: string;
  description: string;
  assetClass: AssetClass;
  amount: string; // acquisition cost, original currency
  currency: Currency;
  acquiredOn: ISODate;
}

export function listAssets(txns: Transaction[]): AssetItem[] {
  return txns
    .filter((t) => t.direction === "OUT" && t.isAsset && t.assetClass)
    .map((t) => ({
      transactionId: t.id,
      description: t.assetDescription ?? t.note ?? "Asset",
      assetClass: t.assetClass as AssetClass,
      amount: t.amount,
      currency: t.currency,
      acquiredOn: t.date,
    }));
}

/**
 * Edit an asset's declared details (class + description) on a transaction, or unflag it entirely
 * (turning a capital purchase back into an operating expense). Refuses when the transaction is
 * locked by an active share. Keeps `id`/`createdAt`; bumps `updatedAt`.
 */
export function editAsset(
  txn: Transaction,
  changes: {
    unflag?: boolean;
    assetClass?: AssetClass;
    assetDescription?: string;
  },
  opts: { lockedIds?: Set<string> } = {},
  now: ISODate = new Date().toISOString(),
): Transaction {
  if (opts.lockedIds?.has(txn.id)) {
    throw new Error(
      "This entry is part of a shared statement/passport and cannot be edited",
    );
  }
  if (changes.unflag) {
    return {
      ...txn,
      isAsset: false,
      assetClass: undefined,
      assetDescription: undefined,
      updatedAt: now,
    };
  }
  return {
    ...txn,
    isAsset: true,
    assetClass: changes.assetClass ?? txn.assetClass,
    assetDescription: changes.assetDescription ?? txn.assetDescription,
    updatedAt: now,
  };
}

export interface AssetSummary {
  total: string;
  byClass: Partial<Record<AssetClass, string>>;
  currency: Currency;
  basis: RateBasis;
  label: "Owner-declared acquisition cost";
}

export function assetSummary(
  txns: Transaction[],
  currency: Currency,
  basis: RateBasis = "EFFECTIVE",
  rates: OfficialRateTable = new OfficialRateTable(),
): AssetSummary {
  const byClass: Partial<Record<AssetClass, string>> = {};
  let total = "0";
  for (const t of txns) {
    if (t.direction !== "OUT" || !t.isAsset || !t.assetClass) continue;
    const val = translate(t, currency, basis, rates).value;
    byClass[t.assetClass] = add(byClass[t.assetClass] ?? "0", val);
    total = add(total, val);
  }
  return {
    total,
    byClass,
    currency,
    basis,
    label: "Owner-declared acquisition cost",
  };
}
