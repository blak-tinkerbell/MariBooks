/**
 * Demo business: six months of realistic, deterministic sample activity so judges and new
 * visitors can explore every screen without signing up. Built with the real domain
 * `buildTransaction`, so the demo data passes the same validation as live data.
 */
import { buildTransaction, type NewTransactionInput, type Rail, type Transaction } from "@maribooks/shared";
import { addDays, perUsdToRate, todayISO } from "./lib.js";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_BUSINESS = "Chipo's Tuck Shop (demo)";

export function seedDemo(today = todayISO()): Transaction[] {
  const rnd = mulberry32(20260930);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const money = (n: number) => n.toFixed(2);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const out: Transaction[] = [];
  let n = 0;

  const add = (i: Omit<NewTransactionInput, "id">) => {
    n += 1;
    const stamp = `${i.date}T${String(8 + (n % 10)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00.000Z`;
    out.push(buildTransaction({ ...i, id: `demo-${String(n).padStart(5, "0")}` }, stamp));
  };
  const imtt = (amount: number, rail: Rail) => (rail === "CASH" ? undefined : money(amount * 0.02));

  const days = 182;
  for (let back = days; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const dom = Number(date.slice(8, 10));
    const growth = 1 + ((days - back) / days) * 0.35; // the shop is growing
    // Monthly fixed costs land even when the day is a Sunday.
    if (dom === 1) add({ direction: "OUT", amount: "250.00", currency: "USD", rail: "BANK", category: "RENT", date, note: "Shop rent", imtt: "5.00" });
    if (dom === 28) add({ direction: "OUT", amount: "300.00", currency: "USD", rail: "CASH", category: "WAGES", date, note: "Shop assistant wages" });
    if (dom === 15) add({ direction: "OUT", amount: "4.50", currency: "USD", rail: "ECOCASH", category: "FEES", date, note: "Merchant account charges" });
    if (back === 120) add({ direction: "OUT", amount: "420.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "Solar backup kit", isAsset: true, assetClass: "EQUIPMENT", assetDescription: "Solar backup kit", imtt: "8.40" });
    if (back === 38) add({ direction: "OUT", amount: "650.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "Display fridge", isAsset: true, assetClass: "EQUIPMENT", assetDescription: "Display fridge", imtt: "13.00" });
    if (dow === 0) continue; // closed on Sundays

    // Sales in USD across rails.
    const salesCount = 2 + Math.floor(rnd() * 3);
    for (let s = 0; s < salesCount; s++) {
      const rail = pick<Rail>(["CASH", "CASH", "ECOCASH", "ECOCASH", "INNBUCKS", "ONEMONEY"]);
      add({ direction: "IN", amount: money(between(10, 62) * growth), currency: "USD", rail, category: "SALES", date, note: pick(["Groceries", "Bread & milk", "Airtime", "Cooldrinks", "Sugar & oil"]) });
    }
    // ZiG sales at the street rate the owner got.
    if (rnd() < 0.55) {
      const street = between(27.0, 28.6).toFixed(2);
      add({ direction: "IN", amount: money(between(150, 900) * growth), currency: "ZiG", rail: pick<Rail>(["CASH", "ECOCASH"]), category: "SALES", date, note: "ZiG sales", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }
    // Rand from cross-border customers.
    if (rnd() < 0.25) {
      const street = between(17.9, 18.6).toFixed(2);
      add({ direction: "IN", amount: money(between(120, 600)), currency: "ZAR", rail: "CASH", category: "SALES", date, note: "Cross-border customer", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }
    // A weekly bulk order from a local school tuck-shop, paid by bank transfer.
    if (dow === 2) add({ direction: "IN", amount: money(between(90, 180) * growth), currency: "USD", rail: "BANK", category: "SALES", date, note: "School tuck-shop bulk order" });
    // Stock twice a week.
    if (dow === 1 || dow === 4) {
      const rail = pick<Rail>(["BANK", "ECOCASH", "CASH"]);
      const amt = between(95, 240) * growth;
      add({ direction: "OUT", amount: money(amt), currency: "USD", rail, category: "STOCK", date, note: pick(["Bread & milk stock", "Wholesale groceries", "Cooldrinks crate"]), imtt: imtt(amt, rail) });
    }
    if (dow === 3) {
      const street = between(27.0, 28.6).toFixed(2);
      add({ direction: "OUT", amount: money(between(900, 1900) * growth), currency: "ZiG", rail: "CASH", category: "STOCK", date, note: "Vegetables (market)", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }
    if (dow === 5) add({ direction: "OUT", amount: money(between(10, 32)), currency: "USD", rail: "CASH", category: "TRANSPORT", date, note: "Kombi to wholesaler" });

  }
  return out;
}
