/**
 * Decimal-safe money arithmetic.
 *
 * We never use binary floats for money. Amounts are decimal strings; internally we operate on
 * integer "minor units" scaled to a fixed number of decimal places, then format back. This
 * avoids the classic 0.1 + 0.2 !== 0.3 problem for currency.
 */

import type { Currency } from "./types.js";

/** Working precision. Money is presented at 2dp; rates can need more, handled separately. */
export const MONEY_SCALE = 2;

/** Parse a decimal string into a scaled BigInt at the given scale. Throws on invalid input. */
export function toScaled(value: string, scale: number = MONEY_SCALE): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal: "${value}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const fracPadded = (fracPart + "0".repeat(scale)).slice(0, scale);
  // Round half-up on any digits beyond the scale.
  const extra = fracPart.slice(scale);
  let scaled = BigInt(intPart + fracPadded);
  if (extra.length > 0 && Number(extra[0]) >= 5) {
    scaled += 1n;
  }
  return negative ? -scaled : scaled;
}

/** Format a scaled BigInt back to a fixed-scale decimal string. */
export function fromScaled(scaled: bigint, scale: number = MONEY_SCALE): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const s = abs.toString().padStart(scale + 1, "0");
  const intPart = s.slice(0, s.length - scale);
  const fracPart = scale > 0 ? "." + s.slice(s.length - scale) : "";
  return (negative ? "-" : "") + intPart + fracPart;
}

export function add(a: string, b: string): string {
  return fromScaled(toScaled(a) + toScaled(b));
}

export function subtract(a: string, b: string): string {
  return fromScaled(toScaled(a) - toScaled(b));
}

/** Sum a list of decimal strings safely. */
export function sum(values: string[]): string {
  return fromScaled(values.reduce((acc, v) => acc + toScaled(v), 0n));
}

/**
 * Multiply a money amount by a decimal rate (e.g. FX). Rate may carry more precision than money.
 * Returns a money-scaled string with half-up rounding.
 */
export function multiplyRate(
  amount: string,
  rate: string,
  rateScale = 6,
): string {
  const amt = toScaled(amount, MONEY_SCALE); // scaled to 2dp
  const r = toScaled(rate, rateScale); // scaled to rateScale
  // product is scaled to (MONEY_SCALE + rateScale); reduce back to MONEY_SCALE with rounding.
  const product = amt * r;
  const divisor = 10n ** BigInt(rateScale);
  const half = divisor / 2n;
  const rounded = (product + (product >= 0n ? half : -half)) / divisor;
  return fromScaled(rounded, MONEY_SCALE);
}

export function isPositive(value: string): boolean {
  return toScaled(value) > 0n;
}

export function isValidAmount(value: string): boolean {
  try {
    return toScaled(value) > 0n;
  } catch {
    return false;
  }
}

const SYMBOLS: Record<Currency, string> = {
  USD: "US$",
  ZiG: "ZiG",
  ZAR: "R",
};

/** Present an amount with an explicit, unambiguous currency label. */
export function formatMoney(value: string, currency: Currency): string {
  const scaled = toScaled(value);
  const formatted = fromScaled(scaled);
  return `${SYMBOLS[currency]}${formatted} ${currency}`;
}
