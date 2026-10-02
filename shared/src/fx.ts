/**
 * FX engine — dual basis, multi-currency (USD / ZiG / ZAR).
 *
 * EFFECTIVE basis: uses the market rate the owner entered on the transaction itself.
 * OFFICIAL  basis: uses a maintained, dated reference-rate table (for statutory-styled reports).
 *
 * A street/effective rate is NEVER presented as the statutory basis; the basis label travels
 * with every translated figure.
 */

import { multiplyRate } from "./money.js";
import type {
  Currency,
  CurrencyPair,
  ISODate,
  OfficialRate,
  RateBasis,
  Transaction,
} from "./types.js";

const RATE_SCALE = 6;

export interface TranslationResult {
  value: string; // amount in the target currency
  rate: string; // rate applied (1 unit `from` = rate units `to`)
  rateDate: ISODate | null; // date of the official rate used (null for pass-through / effective)
  basis: RateBasis;
  note?: string;
}

const OFFICIAL_NOTE = "Confirm the applicable ZIMRA/reference rate.";

/** Canonical pair string for two currencies, plus whether the args are inverted vs canonical. */
export function pairFor(
  from: Currency,
  to: Currency,
): { pair: CurrencyPair; inverted: boolean } | null {
  if (from === to) return null;
  const direct = `${from}/${to}` as CurrencyPair;
  const inverse = `${to}/${from}` as CurrencyPair;
  const known: CurrencyPair[] = ["USD/ZiG", "USD/ZAR", "ZiG/ZAR"];
  if (known.includes(direct)) return { pair: direct, inverted: false };
  if (known.includes(inverse)) return { pair: inverse, inverted: true };
  return null;
}

/** Invert a decimal rate string (1 / rate) at rate precision. */
function invertRate(rate: string): string {
  const one = "1";
  // 1 / rate, computed at RATE_SCALE precision via scaled integer division.
  const scaled = 10n ** BigInt(RATE_SCALE * 2);
  const r = BigInt(Math.round(Number(rate) * 10 ** RATE_SCALE)); // rate has manageable precision
  if (r === 0n) throw new Error("Cannot invert a zero rate");
  const result = scaled / r; // scaled to RATE_SCALE
  const s = result.toString().padStart(RATE_SCALE + 1, "0");
  const intPart = s.slice(0, s.length - RATE_SCALE);
  const fracPart = s.slice(s.length - RATE_SCALE);
  void one;
  return `${intPart}.${fracPart}`;
}

/** Dated official-rate table with most-recent-on-or-before lookup. */
export class OfficialRateTable {
  private byPair = new Map<CurrencyPair, OfficialRate[]>();

  constructor(rates: OfficialRate[] = []) {
    for (const r of rates) this.upsert(r);
  }

  upsert(rate: OfficialRate): void {
    const list = this.byPair.get(rate.pair) ?? [];
    const idx = list.findIndex((r) => r.date === rate.date);
    if (idx >= 0) list[idx] = rate;
    else list.push(rate);
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    this.byPair.set(rate.pair, list);
  }

  upsertManualRate(pair: CurrencyPair, date: ISODate, rate: string): void {
    this.upsert({ pair, date, rate, source: "MANUAL" });
  }

  /** Most recent rate on or before `date` for the pair, or null. */
  getRateForDate(pair: CurrencyPair, date: ISODate): OfficialRate | null {
    const list = this.byPair.get(pair);
    if (!list || list.length === 0) return null;
    let found: OfficialRate | null = null;
    for (const r of list) {
      if (r.date <= date) found = r;
      else break;
    }
    return found;
  }

  history(pair?: CurrencyPair): OfficialRate[] {
    if (pair) return [...(this.byPair.get(pair) ?? [])];
    return [...this.byPair.values()].flat();
  }
}

/**
 * Translate a transaction's principal amount into `to` currency using the given basis.
 * Matching-currency amounts pass through untouched.
 */
export function translate(
  txn: Pick<Transaction, "amount" | "currency" | "date" | "effectiveRate">,
  to: Currency,
  basis: RateBasis,
  officialRates?: OfficialRateTable,
): TranslationResult {
  if (txn.currency === to) {
    return { value: txn.amount, rate: "1", rateDate: null, basis };
  }

  if (basis === "EFFECTIVE") {
    const er = txn.effectiveRate;
    if (er && er.toCurrency === to) {
      return {
        value: multiplyRate(txn.amount, er.rate),
        rate: er.rate,
        rateDate: null,
        basis: "EFFECTIVE",
      };
    }
    // No usable effective rate for this target: fall back to OFFICIAL and label it.
    // (Falls through to the OFFICIAL branch below.)
  }

  // OFFICIAL basis (or EFFECTIVE fallback).
  if (!officialRates) {
    throw new Error(
      `No official rate table supplied to translate ${txn.currency}->${to}`,
    );
  }
  const pinfo = pairFor(txn.currency, to);
  if (!pinfo) {
    throw new Error(`Unsupported currency pair ${txn.currency}->${to}`);
  }
  const official = officialRates.getRateForDate(pinfo.pair, txn.date);
  if (!official) {
    throw new Error(
      `No official ${pinfo.pair} rate on or before ${txn.date}`,
    );
  }
  const appliedRate = pinfo.inverted ? invertRate(official.rate) : official.rate;
  return {
    value: multiplyRate(txn.amount, appliedRate),
    rate: appliedRate,
    rateDate: official.date,
    basis: "OFFICIAL",
    note: OFFICIAL_NOTE,
  };
}
