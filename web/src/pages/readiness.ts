import type { Passport, Transaction } from "@maribooks/shared";

/**
 * Four plain-language checks a lender would look for. Each is computed from the owner's own
 * records; nothing here is a credit score.
 */
export function readiness(txns: Transaction[], passport: Passport) {
  const months = new Set(txns.map((t) => t.date.slice(0, 7))).size;
  const foreign = txns.filter((t) => t.currency !== "USD");
  const items = [
    { label: `3+ months of records (${months} so far)`, ok: months >= 3 },
    { label: "Every ZiG/ZAR entry has a market rate", ok: foreign.every((t) => !!t.effectiveRate) },
    { label: "Capital expenditure (APEX) declared", ok: txns.some((t) => t.isAsset) },
    { label: "Steady monthly turnover", ok: passport.cashFlowStability === "STRONG" },
  ];
  return { items, done: items.filter((i) => i.ok).length };
}
