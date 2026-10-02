/**
 * Core domain types for MariBooks.
 * These are framework-free and shared by the SPA and the API.
 */

export type Currency = "USD" | "ZiG" | "ZAR";
export const CURRENCIES: readonly Currency[] = ["USD", "ZiG", "ZAR"] as const;

export type Direction = "IN" | "OUT";

export type Rail =
  | "CASH"
  | "ECOCASH"
  | "ONEMONEY"
  | "INNBUCKS"
  | "ZIPIT"
  | "BANK"
  | "CARD";
export const RAILS: readonly Rail[] = [
  "CASH",
  "ECOCASH",
  "ONEMONEY",
  "INNBUCKS",
  "ZIPIT",
  "BANK",
  "CARD",
] as const;

export type Category =
  | "SALES"
  | "STOCK"
  | "RENT"
  | "TRANSPORT"
  | "WAGES"
  | "FEES"
  | "OTHER";
export const CATEGORIES: readonly Category[] = [
  "SALES",
  "STOCK",
  "RENT",
  "TRANSPORT",
  "WAGES",
  "FEES",
  "OTHER",
] as const;

export type AssetClass =
  | "EQUIPMENT"
  | "VEHICLE"
  | "TOOLS"
  | "FURNITURE"
  | "PROPERTY"
  | "OTHER";
export const ASSET_CLASSES: readonly AssetClass[] = [
  "EQUIPMENT",
  "VEHICLE",
  "TOOLS",
  "FURNITURE",
  "PROPERTY",
  "OTHER",
] as const;

/** Rate basis used when translating for a report. */
export type RateBasis = "EFFECTIVE" | "OFFICIAL";

/** ISO-8601 date string (yyyy-mm-dd) or full timestamp. */
export type ISODate = string;

/**
 * Owner-entered effective (street) rate stored on a cross-currency transaction.
 * Meaning: 1 unit of the transaction's `currency` = `rate` units of `toCurrency`.
 */
export interface EffectiveRate {
  toCurrency: Currency;
  rate: string; // decimal string; never a float
}

/**
 * Proof of a transaction — an uploaded invoice or receipt image/PDF, stored privately in S3.
 * `key` is the object key under the owner's tenant prefix; the file itself never passes through
 * the API (the browser uploads it straight to S3 with a short-lived presigned URL). Attaching
 * proof strengthens the record for a lender: a passport entry backed by a receipt is verifiable.
 */
export interface Proof {
  key: string; // S3 object key, e.g. "TENANT#<sub>/proof/<uuid>.jpg"
  kind: "RECEIPT" | "INVOICE";
  contentType: string; // e.g. "image/jpeg", "application/pdf"
  fileName?: string; // original name, for display only
  uploadedAt: ISODate;
}

export interface Transaction {
  id: string; // client-generated UUID; idempotency key
  direction: Direction;
  amount: string; // principal, decimal string, in `currency`
  currency: Currency;
  rail: Rail;
  fee?: string; // rail fee, same currency, distinct from principal
  imtt?: string; // IMTT charge, same currency, distinct from principal
  category: Category;
  date: ISODate;
  note?: string;
  effectiveRate?: EffectiveRate; // present when cross-currency
  isAsset?: boolean; // money-out only
  assetClass?: AssetClass; // required when isAsset === true
  assetDescription?: string;
  proof?: Proof; // optional uploaded invoice/receipt backing this entry
  createdAt: ISODate;
  updatedAt: ISODate;
}

/**
 * Draft fields extracted from an uploaded receipt/invoice by Amazon Textract (AnalyzeExpense).
 * Like SmsDraft, it is treated as untrusted: every field is re-validated against the domain
 * before it is offered to prefill the capture form, and the owner always confirms before saving.
 */
export interface ReceiptDraft {
  amount?: string; // total, decimal string, no thousands separators
  currency?: Currency; // only when confidently detected
  date?: ISODate; // yyyy-mm-dd
  vendor?: string; // supplier/merchant name → note
  kind: "RECEIPT" | "INVOICE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "TEXTRACT";
}

export type CurrencyPair = "USD/ZiG" | "USD/ZAR" | "ZiG/ZAR";
export const CURRENCY_PAIRS: readonly CurrencyPair[] = [
  "USD/ZiG",
  "USD/ZAR",
  "ZiG/ZAR",
] as const;

export interface OfficialRate {
  pair: CurrencyPair;
  date: ISODate;
  rate: string; // decimal string; 1 unit of base = `rate` units of quote
  source: "FEED" | "MANUAL";
  note?: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  tin?: string;
  reportingCurrency: Currency;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** What kind of artifact a share link exposes. */
export type ShareKind = "PASSPORT" | "STATEMENT";

/**
 * A consent-gated, revocable share of a passport or statement.
 * Records who shared what, when, and whether the share is still active. Once a transaction is
 * referenced by an ACTIVE share it is considered "locked" (no edit/delete) to preserve the
 * integrity of what a lender was shown.
 */
export interface ShareLink {
  id: string; // client-generated UUID; also the public token
  kind: ShareKind;
  consentAck: true; // sharing is only ever created with explicit consent
  createdAt: ISODate;
  revokedAt?: ISODate; // set when revoked; absent while active
  currency: Currency; // reporting currency the artifact was rendered in
  basis: RateBasis; // rate basis the artifact was rendered on
  /** Transaction ids included in the shared artifact (drives the edit/delete lock). */
  transactionIds: string[];
  note?: string;
}
