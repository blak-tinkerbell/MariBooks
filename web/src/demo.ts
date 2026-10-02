/**
 * Demo business: TS Haute Couture — Tryphine's boutique selling clothing and accessories
 * across two branches. Six months of realistic, deterministic sample activity so judges and
 * new visitors can explore every screen without signing up.
 *
 * The story this data tells:
 *  - Two branches (Avondale & CBD) make daily USD sales across cash, card and mobile rails.
 *  - Stock is imported from China and Turkey in USD, paid by bank transfer with IMTT.
 *  - Business trips to source stock (flights, accommodation, transport) are operating costs.
 *  - Store renovations and display mannequins are capital assets, kept out of profit.
 *  - Account clients buy on credit through the month and settle in a lump sum at month-end.
 *  - Rent, wages and bank/card fees land as fixed monthly costs.
 *  - A little cross-border ZAR (South African buyers/suppliers) exercises multi-currency.
 *
 * Built with the real domain `buildTransaction`, so the demo passes the same validation as live
 * data. Everything is deterministic (seeded RNG) so the figures are identical on every load.
 */
import { buildTransaction, type NewTransactionInput, type Proof, type Rail, type Transaction } from "@maribooks/shared";
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

export const DEMO_BUSINESS = "TS Haute Couture (demo)";

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

  // Boutique vocabulary.
  const BRANCHES = ["Avondale branch", "CBD branch"];
  const CLOTHING = ["Two-piece set", "Occasion dress", "Office blazer", "Denim range", "Ankara dress", "Jumpsuit", "Kaftan"];
  const ACCESSORIES = ["Handbag", "Heels", "Statement necklace", "Scarf set", "Sunglasses", "Belt & clutch"];
  // Month-end account clients who buy on credit and settle in a lump sum.
  const CREDIT_CLIENTS = ["Mrs Dube (account)", "Chido B. (account)", "Rutendo M. (account)", "Mrs Ncube (account)"];

  const days = 182;
  for (let back = days; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const dom = Number(date.slice(8, 10));
    const monthsIn = (days - back) / days;
    const growth = 1 + monthsIn * 0.4; // the boutique is growing
    // Sample proof files (bundled with the app) attached to the records a lender cares about.
    const invoice = (name: string): Proof => ({ key: "demo-proof/sample-invoice.svg", kind: "INVOICE", contentType: "image/svg+xml", fileName: name, uploadedAt: `${date}T09:00:00.000Z` });
    const receipt = (name: string): Proof => ({ key: "demo-proof/sample-receipt.svg", kind: "RECEIPT", contentType: "image/svg+xml", fileName: name, uploadedAt: `${date}T09:00:00.000Z` });

    // ---- Monthly fixed costs (land even on a Sunday) --------------------------------------
    if (dom === 1) {
      add({ direction: "OUT", amount: "900.00", currency: "USD", rail: "BANK", category: "RENT", date, note: "Avondale shop rent", imtt: "18.00" });
      add({ direction: "OUT", amount: "750.00", currency: "USD", rail: "BANK", category: "RENT", date, note: "CBD shop rent", imtt: "15.00" });
    }
    if (dom === 25) {
      add({ direction: "OUT", amount: "320.00", currency: "USD", rail: "CASH", category: "WAGES", date, note: "Avondale shop assistants" });
      add({ direction: "OUT", amount: "300.00", currency: "USD", rail: "CASH", category: "WAGES", date, note: "CBD shop assistants" });
    }
    if (dom === 15) add({ direction: "OUT", amount: "22.00", currency: "USD", rail: "CARD", category: "FEES", date, note: "Card machine (POS) monthly charges" });
    if (dom === 5) add({ direction: "OUT", amount: "9.00", currency: "USD", rail: "ECOCASH", category: "FEES", date, note: "Merchant wallet charges" });

    // ---- Month-end: account clients settle their running credit in a lump sum --------------
    // Clients borrow stock through the month and pay at month-end (paid month-end as requested).
    if (dom === 28) {
      const settlers = 2 + Math.floor(rnd() * 2); // two to three clients settle
      for (let c = 0; c < settlers; c++) {
        const rail = pick<Rail>(["BANK", "ECOCASH", "CASH"]);
        const amt = between(120, 380) * growth;
        add({ direction: "IN", amount: money(amt), currency: "USD", rail, category: "SALES", date, note: `${pick(CREDIT_CLIENTS)} month-end settlement` });
      }
    }

    // ---- Capital assets: store renovations and display mannequins --------------------------
    if (back === 150) add({ direction: "OUT", amount: "2400.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "Avondale store renovation (shopfit)", isAsset: true, assetClass: "PROPERTY", assetDescription: "Avondale store renovation (shopfit)", imtt: "48.00", proof: invoice("avondale-shopfit-invoice.pdf") });
    if (back === 132) add({ direction: "OUT", amount: "640.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "Display mannequins ×8", isAsset: true, assetClass: "FURNITURE", assetDescription: "Display mannequins ×8", imtt: "12.80" });
    if (back === 70) add({ direction: "OUT", amount: "1850.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "CBD branch renovation & signage", isAsset: true, assetClass: "PROPERTY", assetDescription: "CBD branch renovation & signage", imtt: "37.00" });
    if (back === 44) add({ direction: "OUT", amount: "520.00", currency: "USD", rail: "BANK", category: "OTHER", date, note: "Glass display shelving & rails", isAsset: true, assetClass: "FURNITURE", assetDescription: "Glass display shelving & rails", imtt: "10.40" });
    if (back === 20) add({ direction: "OUT", amount: "380.00", currency: "USD", rail: "CARD", category: "OTHER", date, note: "Mannequins & mirror units", isAsset: true, assetClass: "FURNITURE", assetDescription: "Mannequins & mirror units", imtt: "7.60" });

    // ---- Import stock from China & Turkey (USD, bank transfer, IMTT) ------------------------
    // Large orders a few times across the six months, timed around sourcing trips. These carry
    // a sample invoice as proof — the kind of evidence a lender wants to see behind a record.
    if (back === 160) add({ direction: "OUT", amount: "3200.00", currency: "USD", rail: "BANK", category: "STOCK", date, note: "China order — clothing containers", imtt: "64.00", proof: invoice("guangzhou-invoice.pdf") });
    if (back === 118) add({ direction: "OUT", amount: "2100.00", currency: "USD", rail: "BANK", category: "STOCK", date, note: "Turkey order — dresses & handbags", imtt: "42.00", proof: invoice("istanbul-textiles-invoice.pdf") });
    if (back === 76) add({ direction: "OUT", amount: "2850.00", currency: "USD", rail: "BANK", category: "STOCK", date, note: "China order — accessories & shoes", imtt: "57.00", proof: invoice("guangzhou-invoice-2.pdf") });
    if (back === 30) add({ direction: "OUT", amount: "2450.00", currency: "USD", rail: "BANK", category: "STOCK", date, note: "Turkey order — autumn range", imtt: "49.00", proof: invoice("istanbul-autumn-invoice.pdf") });

    // ---- Business trips to source stock: flights, accommodation, transport -----------------
    // A sourcing trip clusters its costs over a few days.
    if (back === 164) add({ direction: "OUT", amount: "860.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Flights — Guangzhou sourcing trip", proof: receipt("guangzhou-flight-receipt.jpg") });
    if (back === 163) add({ direction: "OUT", amount: "420.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Hotel — Guangzhou (4 nights)" });
    if (back === 162) add({ direction: "OUT", amount: "95.00", currency: "USD", rail: "CASH", category: "TRANSPORT", date, note: "Taxis & market transport — China" });
    if (back === 122) add({ direction: "OUT", amount: "540.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Flights — Istanbul sourcing trip" });
    if (back === 121) add({ direction: "OUT", amount: "360.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Accommodation — Istanbul" });
    if (back === 80) add({ direction: "OUT", amount: "890.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Flights — Guangzhou sourcing trip" });
    if (back === 79) add({ direction: "OUT", amount: "450.00", currency: "USD", rail: "CARD", category: "TRANSPORT", date, note: "Hotel — Guangzhou (5 nights)" });
    // Cross-border buying run to Johannesburg paid in rand.
    if (back === 52) {
      const street = between(17.9, 18.6).toFixed(2);
      add({ direction: "OUT", amount: money(between(2600, 3400)), currency: "ZAR", rail: "CARD", category: "STOCK", date, note: "Johannesburg stock run — fabrics & bags", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
      add({ direction: "OUT", amount: money(between(900, 1300)), currency: "ZAR", rail: "CARD", category: "TRANSPORT", date, note: "Fuel & accommodation — Johannesburg", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }

    if (dow === 0) continue; // both branches closed on Sundays

    // ---- Daily walk-in sales across both branches (USD) ------------------------------------
    const salesCount = 3 + Math.floor(rnd() * 4);
    for (let s = 0; s < salesCount; s++) {
      const rail = pick<Rail>(["CARD", "CARD", "CASH", "ECOCASH", "ECOCASH", "INNBUCKS", "ONEMONEY"]);
      const item = rnd() < 0.6 ? pick(CLOTHING) : pick(ACCESSORIES);
      add({ direction: "IN", amount: money(between(18, 140) * growth), currency: "USD", rail, category: "SALES", date, note: `${item} · ${pick(BRANCHES)}` });
    }
    // Occasion/bridal higher-value sale on busy days.
    if (dow === 5 || dow === 6) {
      add({ direction: "IN", amount: money(between(180, 420) * growth), currency: "USD", rail: pick<Rail>(["CARD", "BANK"]), category: "SALES", date, note: `Occasion outfit · ${pick(BRANCHES)}` });
    }
    // South African cross-border customers paying in rand.
    if (rnd() < 0.2) {
      const street = between(17.9, 18.6).toFixed(2);
      add({ direction: "IN", amount: money(between(300, 900)), currency: "ZAR", rail: "CASH", category: "SALES", date, note: `Cross-border customer · ${pick(BRANCHES)}`, effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }
    // Occasional local ZiG sale at the market rate the owner got.
    if (rnd() < 0.15) {
      const street = between(27.0, 28.6).toFixed(2);
      add({ direction: "IN", amount: money(between(400, 1400) * growth), currency: "ZiG", rail: pick<Rail>(["CASH", "ECOCASH"]), category: "SALES", date, note: "ZiG sale · CBD branch", effectiveRate: { toCurrency: "USD", rate: perUsdToRate(street) } });
    }

    // ---- Local running costs ---------------------------------------------------------------
    // Mid-week local restock top-ups (packaging, trims, local wholesale).
    if (dow === 2) {
      const rail = pick<Rail>(["ECOCASH", "CASH", "CARD"]);
      const amt = between(60, 180) * growth;
      add({ direction: "OUT", amount: money(amt), currency: "USD", rail, category: "STOCK", date, note: pick(["Packaging & garment bags", "Local wholesale tops", "Trims & hangers"]), imtt: imtt(amt, rail) });
    }
    // Deliveries between branches / to clients.
    if (dow === 4) add({ direction: "OUT", amount: money(between(8, 24)), currency: "USD", rail: "CASH", category: "TRANSPORT", date, note: "Delivery between branches" });
    // Marketing (photoshoots, boosted posts).
    if (dow === 3 && rnd() < 0.5) add({ direction: "OUT", amount: money(between(20, 70)), currency: "USD", rail: "CARD", category: "OTHER", date, note: pick(["Social media promotion", "Lookbook photoshoot", "Flyers & tags"]) });
  }
  return out;
}
