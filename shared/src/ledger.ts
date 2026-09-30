/**
 * Ledger — validation and construction of transactions.
 * The store (IndexedDB in dev / DynamoDB via API) is injected by the caller; this module keeps
 * the domain rules pure and testable.
 */

import { isValidAmount, toScaled } from "./money.js";
import type {
  AssetClass,
  Category,
  Currency,
  Direction,
  EffectiveRate,
  ISODate,
  Rail,
  Transaction,
} from "./types.js";
import { ASSET_CLASSES, CATEGORIES, CURRENCIES, RAILS } from "./types.js";

export interface NewTransactionInput {
  id: string;
  direction: Direction;
  amount: string;
  currency: Currency;
  rail: Rail;
  category: Category;
  date: ISODate;
  fee?: string;
  imtt?: string;
  note?: string;
  effectiveRate?: EffectiveRate;
  isAsset?: boolean;
  assetClass?: AssetClass;
  assetDescription?: string;
}

export class ValidationError extends Error {}

/** Validate an input, throwing ValidationError on the first problem. */
export function validateTransaction(input: NewTransactionInput): void {
  if (!input.id) throw new ValidationError("Missing id");
  if (!isValidAmount(input.amount)) {
    throw new ValidationError("Amount must be a positive number");
  }
  if (!CURRENCIES.includes(input.currency)) {
    throw new ValidationError(`Unknown currency: ${input.currency}`);
  }
  if (!RAILS.includes(input.rail)) {
    throw new ValidationError(`Unknown payment rail: ${input.rail}`);
  }
  if (!CATEGORIES.includes(input.category)) {
    throw new ValidationError(`Unknown category: ${input.category}`);
  }
  if (input.fee !== undefined && !isValidAmountOrZero(input.fee)) {
    throw new ValidationError("Fee must be a non-negative number");
  }
  if (input.imtt !== undefined && !isValidAmountOrZero(input.imtt)) {
    throw new ValidationError("IMTT must be a non-negative number");
  }
  if (input.isAsset) {
    if (input.direction !== "OUT") {
      throw new ValidationError("Only money-out can be flagged as an asset");
    }
    if (!input.assetClass || !ASSET_CLASSES.includes(input.assetClass)) {
      throw new ValidationError("An asset requires a valid asset class");
    }
  }
  if (input.effectiveRate) {
    if (input.effectiveRate.toCurrency === input.currency) {
      throw new ValidationError(
        "Effective rate target must differ from the transaction currency",
      );
    }
    if (!isValidAmount(input.effectiveRate.rate)) {
      throw new ValidationError("Effective rate must be a positive number");
    }
  }
}

export class LockedTransactionError extends Error {}

/**
 * Apply edits to an existing transaction and re-validate. Preserves `id` and `createdAt`,
 * bumps `updatedAt`. Refuses to edit a transaction that is locked (already included in an
 * active share) so we never change what a lender was shown.
 */
export function editTransaction(
  existing: Transaction,
  changes: Partial<Omit<NewTransactionInput, "id">>,
  opts: { lockedIds?: Set<string> } = {},
  now: ISODate = new Date().toISOString(),
): Transaction {
  if (opts.lockedIds?.has(existing.id)) {
    throw new LockedTransactionError(
      "This entry is part of a shared statement/passport and cannot be edited",
    );
  }
  const merged: NewTransactionInput = {
    id: existing.id,
    direction: changes.direction ?? existing.direction,
    amount: changes.amount ?? existing.amount,
    currency: changes.currency ?? existing.currency,
    rail: changes.rail ?? existing.rail,
    category: changes.category ?? existing.category,
    date: changes.date ?? existing.date,
    fee: changes.fee ?? existing.fee,
    imtt: changes.imtt ?? existing.imtt,
    note: changes.note ?? existing.note,
    effectiveRate: changes.effectiveRate ?? existing.effectiveRate,
    isAsset: changes.isAsset ?? existing.isAsset,
    assetClass: changes.assetClass ?? existing.assetClass,
    assetDescription: changes.assetDescription ?? existing.assetDescription,
  };
  validateTransaction(merged);
  return {
    ...buildTransaction(merged, existing.createdAt),
    updatedAt: now,
  };
}

/** Guard a delete: refuse when the transaction is locked by an active share. */
export function assertDeletable(
  id: string,
  lockedIds?: Set<string>,
): void {
  if (lockedIds?.has(id)) {
    throw new LockedTransactionError(
      "This entry is part of a shared statement/passport and cannot be deleted",
    );
  }
}

function isValidAmountOrZero(value: string): boolean {
  // Accept "0", "0.00" and positive decimals; reject negatives and garbage.
  try {
    return toScaled(value) >= 0n;
  } catch {
    return false;
  }
}

/** Build a validated Transaction, stamping created/updated timestamps. */
export function buildTransaction(
  input: NewTransactionInput,
  now: ISODate = new Date().toISOString(),
): Transaction {
  validateTransaction(input);
  return {
    id: input.id,
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    rail: input.rail,
    category: input.category,
    date: input.date,
    fee: input.fee,
    imtt: input.imtt,
    note: input.note,
    effectiveRate: input.effectiveRate,
    isAsset: input.isAsset,
    assetClass: input.isAsset ? input.assetClass : undefined,
    assetDescription: input.isAsset ? input.assetDescription : undefined,
    createdAt: now,
    updatedAt: now,
  };
}
