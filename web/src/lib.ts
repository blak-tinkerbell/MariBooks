/** Small presentation helpers shared by the pages. Money stays a decimal string throughout. */
import type { AssetClass, Category, Currency, OfficialRate, Rail, Transaction } from "@maribooks/shared";

export const BASE: Currency = "USD";

const SYM: Record<Currency, string> = { USD: "US$", ZiG: "ZiG ", ZAR: "R" };

export function sym(cur: Currency): string {
  return SYM[cur].trim();
}

/** Grouped, signed money label, e.g. "US$1,284.50" or "−ZiG 1,240.00". */
export function fmt(value: string, cur: Currency, opts: { sign?: boolean } = {}): string {
  const neg = value.trim().startsWith("-");
  const abs = neg ? value.trim().slice(1) : value.trim();
  const [int = "0", frac = ""] = abs.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = neg ? "−" : opts.sign ? "+" : "";
  return `${sign}${SYM[cur]}${grouped}.${(frac + "00").slice(0, 2)}`;
}

export const isNeg = (v: string) => v.trim().startsWith("-");
export const isZero = (v: string) => /^-?0+(\.0+)?$/.test(v.trim());

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First/last day of the month `offset` months from the month containing `iso`. */
export function monthRange(iso: string, offset = 0): { from: string; to: string; label: string } {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    label: first.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
  };
}

export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const RAIL_LABEL: Record<Rail, string> = {
  CASH: "Cash",
  ECOCASH: "EcoCash",
  ONEMONEY: "OneMoney",
  INNBUCKS: "InnBucks",
  ZIPIT: "Zipit",
  BANK: "Bank transfer",
  CARD: "Card (swipe)",
};

export const CAT_LABEL: Record<Category, string> = {
  SALES: "Sales",
  STOCK: "Stock",
  RENT: "Rent",
  TRANSPORT: "Transport",
  WAGES: "Wages",
  FEES: "Bank & mobile fees",
  OTHER: "Other",
};

export const IN_CATEGORIES: Category[] = ["SALES", "OTHER"];
export const OUT_CATEGORIES: Category[] = ["STOCK", "RENT", "WAGES", "TRANSPORT", "FEES", "OTHER"];

export const ASSET_LABEL: Record<AssetClass, string> = {
  EQUIPMENT: "Equipment (fridge, machine)",
  VEHICLE: "Vehicle",
  TOOLS: "Tools",
  FURNITURE: "Furniture & fittings",
  PROPERTY: "Property",
  OTHER: "Other asset",
};

/**
 * The owner's most recent street rate per foreign currency, as "1 USD = x".
 * Derived from the effective rates they entered on their own transactions.
 */
export function latestStreetRates(txns: Transaction[]): Partial<Record<Currency, { perUsd: string; date: string }>> {
  const out: Partial<Record<Currency, { perUsd: string; date: string }>> = {};
  const sorted = [...txns].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1));
  for (const t of sorted) {
    if (t.currency === BASE || out[t.currency]) continue;
    const er = t.effectiveRate;
    if (er && er.toCurrency === BASE && Number(er.rate) > 0) {
      out[t.currency] = { perUsd: (1 / Number(er.rate)).toFixed(2), date: t.date };
    }
  }
  return out;
}

/** "1 USD = x cur" entered by the owner → stored rate "1 cur = y USD" (8dp decimal string). */
export function perUsdToRate(perUsd: string): string {
  return (1 / Number(perUsd)).toFixed(8);
}

/**
 * Sample reference rates used only until the owner (or a feed) records official rates.
 * They are clearly labelled as samples wherever they affect a figure.
 */
export const SAMPLE_OFFICIAL_RATES: OfficialRate[] = [
  { pair: "USD/ZiG", date: "2024-04-05", rate: "26.80", source: "MANUAL", note: "Sample — replace with the official rate" },
  { pair: "USD/ZAR", date: "2024-04-05", rate: "18.10", source: "MANUAL", note: "Sample — replace with the official rate" },
  { pair: "ZiG/ZAR", date: "2024-04-05", rate: "0.675", source: "MANUAL", note: "Sample — replace with the official rate" },
];

export function feeFromPct(amount: string, pct: string): string | undefined {
  const a = Number(amount);
  const p = Number(pct);
  if (!pct.trim() || !(a > 0) || !(p > 0)) return undefined;
  // Rounded half-up to cents; the percentage is what the owner entered.
  return (Math.round(a * p) / 100).toFixed(2);
}

export function pctFromFee(amount: string, fee: string): string {
  const a = Number(amount);
  const f = Number(fee);
  if (!(a > 0) || !(f >= 0)) return "";
  return String(Math.round((f / a) * 10_000) / 100);
}
