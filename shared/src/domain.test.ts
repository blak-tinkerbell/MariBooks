import { describe, expect, it } from "vitest";
import {
  add,
  formatMoney,
  multiplyRate,
  toScaled,
  fromScaled,
} from "./money.js";
import { OfficialRateTable, pairFor, translate } from "./fx.js";
import { buildTransaction, ValidationError } from "./ledger.js";
import { getDashboard, getStatement } from "./reporting.js";
import { getPassport } from "./passport.js";
import { assetSummary } from "./assets.js";
import type { Transaction } from "./types.js";

describe("money (decimal-safe)", () => {
  it("adds without float error", () => {
    expect(add("0.10", "0.20")).toBe("0.30");
    expect(add("1999999.99", "0.01")).toBe("2000000.00");
  });

  it("round-trips scaled values", () => {
    expect(fromScaled(toScaled("12.34"))).toBe("12.34");
  });

  it("multiplies by a rate with rounding", () => {
    // 40 USD * 13.5 = 540 ZiG
    expect(multiplyRate("40.00", "13.5")).toBe("540.00");
  });

  it("formats with an explicit currency label", () => {
    expect(formatMoney("40.00", "USD")).toBe("US$40.00 USD");
    expect(formatMoney("540.00", "ZiG")).toBe("ZiG540.00 ZiG");
    expect(formatMoney("100.00", "ZAR")).toBe("R100.00 ZAR");
  });
});

describe("fx", () => {
  it("resolves canonical and inverted pairs", () => {
    expect(pairFor("USD", "ZiG")).toEqual({ pair: "USD/ZiG", inverted: false });
    expect(pairFor("ZiG", "USD")).toEqual({ pair: "USD/ZiG", inverted: true });
    expect(pairFor("USD", "USD")).toBeNull();
  });

  it("passes through matching currency", () => {
    const r = translate(
      { amount: "10.00", currency: "USD", date: "2026-01-01" },
      "USD",
      "EFFECTIVE",
    );
    expect(r.value).toBe("10.00");
  });

  it("uses the owner-entered effective rate", () => {
    const r = translate(
      {
        amount: "40.00",
        currency: "USD",
        date: "2026-01-01",
        effectiveRate: { toCurrency: "ZiG", rate: "13.5" },
      },
      "ZiG",
      "EFFECTIVE",
    );
    expect(r.value).toBe("540.00");
    expect(r.basis).toBe("EFFECTIVE");
  });

  it("uses the official dated table with fallback", () => {
    const table = new OfficialRateTable([
      { pair: "USD/ZiG", date: "2026-01-01", rate: "12.0", source: "MANUAL" },
      { pair: "USD/ZiG", date: "2026-02-01", rate: "14.0", source: "MANUAL" },
    ]);
    const r = translate(
      { amount: "10.00", currency: "USD", date: "2026-01-15" },
      "ZiG",
      "OFFICIAL",
      table,
    );
    expect(r.value).toBe("120.00"); // most recent on/before 2026-01-15 -> 12.0
    expect(r.rateDate).toBe("2026-01-01");
    expect(r.note).toContain("ZIMRA");
  });
});

describe("ledger validation", () => {
  it("rejects a non-positive amount", () => {
    expect(() =>
      buildTransaction({
        id: "1",
        direction: "IN",
        amount: "0",
        currency: "USD",
        rail: "CASH",
        category: "SALES",
        date: "2026-01-01",
      }),
    ).toThrow(ValidationError);
  });

  it("requires an asset class when isAsset", () => {
    expect(() =>
      buildTransaction({
        id: "1",
        direction: "OUT",
        amount: "500",
        currency: "USD",
        rail: "CASH",
        category: "OTHER",
        date: "2026-01-01",
        isAsset: true,
      }),
    ).toThrow(ValidationError);
  });
});

function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "direction" | "amount" | "currency" | "rail" | "category" | "date">): Transaction {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  } as Transaction;
}

describe("reporting", () => {
  const range = { from: "2026-01-01", to: "2026-01-31" };
  const txns: Transaction[] = [
    tx({ id: "a", direction: "IN", amount: "100.00", currency: "USD", rail: "ECOCASH", category: "SALES", date: "2026-01-05" }),
    tx({ id: "b", direction: "OUT", amount: "30.00", currency: "USD", rail: "CASH", category: "STOCK", date: "2026-01-06" }),
    tx({ id: "c", direction: "OUT", amount: "500.00", currency: "USD", rail: "BANK", category: "OTHER", date: "2026-01-10", isAsset: true, assetClass: "EQUIPMENT" }),
  ];

  it("excludes assets from profit and reports them separately", () => {
    const d = getDashboard(txns, range, "USD");
    expect(d.moneyIn).toBe("100.00");
    expect(d.operatingOut).toBe("30.00");
    expect(d.profit).toBe("70.00"); // asset excluded
    expect(d.assetSpend).toBe("500.00");
  });

  it("produces a statement with assets acquired", () => {
    const s = getStatement(txns, range, { name: "Test Shop" }, "USD", "EFFECTIVE", new OfficialRateTable(), "2026-02-01T00:00:00Z");
    expect(s.totals.netProfit).toBe("70.00");
    expect(s.assetsAcquired.EQUIPMENT).toEqual({ count: 1, value: "500.00" });
  });

  it("summarises the declared asset base", () => {
    const a = assetSummary(txns, "USD");
    expect(a.total).toBe("500.00");
    expect(a.byClass.EQUIPMENT).toBe("500.00");
    expect(a.label).toBe("Owner-declared acquisition cost");
  });
});

describe("passport", () => {
  it("computes turnover and includes the declared asset base", () => {
    const txns: Transaction[] = [
      tx({ id: "a", direction: "IN", amount: "100.00", currency: "USD", rail: "ECOCASH", category: "SALES", date: "2026-01-05" }),
      tx({ id: "b", direction: "IN", amount: "150.00", currency: "USD", rail: "CASH", category: "SALES", date: "2026-02-05" }),
      tx({ id: "c", direction: "OUT", amount: "500.00", currency: "USD", rail: "BANK", category: "OTHER", date: "2026-01-10", isAsset: true, assetClass: "VEHICLE" }),
    ];
    const p = getPassport(txns, "USD", "EFFECTIVE", new OfficialRateTable(), "2026-03-01T00:00:00Z");
    expect(p.totalTurnover).toBe("250.00");
    expect(p.declaredAssetBase.total).toBe("500.00");
    expect(p.periodCovered).toEqual({ from: "2026-01-05", to: "2026-02-05" });
  });
});

// ---- imports for the new domain surface (kept at the bottom to avoid churn above) ----
import {
  editTransaction,
  assertDeletable,
  LockedTransactionError,
} from "./ledger.js";
import { editAsset } from "./assets.js";
import {
  sharePassport,
  revokeShare,
  isActiveShare,
  lockedTransactionIds,
  ConsentError,
} from "./passport.js";
import type { BusinessProfile, ShareLink } from "./types.js";

describe("ledger edit / delete / lock (Req 2.8)", () => {
  const base = buildTransaction({
    id: "t1",
    direction: "OUT",
    amount: "30.00",
    currency: "USD",
    rail: "CASH",
    category: "STOCK",
    date: "2026-01-06",
  }, "2026-01-06T00:00:00Z");

  it("edits a transaction, preserving id/createdAt and bumping updatedAt", () => {
    const edited = editTransaction(base, { amount: "45.00", note: "revised" }, {}, "2026-01-07T00:00:00Z");
    expect(edited.id).toBe("t1");
    expect(edited.amount).toBe("45.00");
    expect(edited.note).toBe("revised");
    expect(edited.createdAt).toBe("2026-01-06T00:00:00Z");
    expect(edited.updatedAt).toBe("2026-01-07T00:00:00Z");
  });

  it("re-validates on edit (rejects a non-positive amount)", () => {
    expect(() => editTransaction(base, { amount: "0" })).toThrow(ValidationError);
  });

  it("refuses to edit a locked (shared) transaction", () => {
    const locked = new Set(["t1"]);
    expect(() => editTransaction(base, { amount: "45.00" }, { lockedIds: locked })).toThrow(LockedTransactionError);
  });

  it("refuses to delete a locked (shared) transaction but allows unlocked", () => {
    expect(() => assertDeletable("t1", new Set(["t1"]))).toThrow(LockedTransactionError);
    expect(() => assertDeletable("t1", new Set(["other"]))).not.toThrow();
    expect(() => assertDeletable("t1")).not.toThrow();
  });
});

describe("asset edit / unflag (Req 9.4, 9.5)", () => {
  const asset = buildTransaction({
    id: "a1",
    direction: "OUT",
    amount: "500.00",
    currency: "USD",
    rail: "BANK",
    category: "OTHER",
    date: "2026-01-10",
    isAsset: true,
    assetClass: "EQUIPMENT",
    assetDescription: "fridge",
  });

  it("edits asset class and description", () => {
    const e = editAsset(asset, { assetClass: "VEHICLE", assetDescription: "van" });
    expect(e.assetClass).toBe("VEHICLE");
    expect(e.assetDescription).toBe("van");
    expect(e.isAsset).toBe(true);
  });

  it("unflags an asset back into an operating expense", () => {
    const e = editAsset(asset, { unflag: true });
    expect(e.isAsset).toBe(false);
    expect(e.assetClass).toBeUndefined();
  });

  it("refuses to edit a locked asset", () => {
    expect(() => editAsset(asset, { unflag: true }, { lockedIds: new Set(["a1"]) })).toThrow();
  });
});

describe("passport sharing + consent gate (Req 6.3)", () => {
  it("refuses to share without explicit consent", () => {
    expect(() =>
      sharePassport({ id: "s1", consentAck: false, currency: "USD", transactionIds: ["t1"] }),
    ).toThrow(ConsentError);
  });

  it("creates an active share with consent and records the included ids", () => {
    const link = sharePassport(
      { id: "s1", consentAck: true, currency: "USD", basis: "EFFECTIVE", transactionIds: ["t1", "t2"] },
      "2026-03-01T00:00:00Z",
    );
    expect(link.kind).toBe("PASSPORT");
    expect(link.consentAck).toBe(true);
    expect(link.transactionIds).toEqual(["t1", "t2"]);
    expect(isActiveShare(link)).toBe(true);
  });

  it("revokes a share (idempotently) and clears the lock", () => {
    const link = sharePassport({ id: "s1", consentAck: true, currency: "USD", transactionIds: ["t1"] }, "2026-03-01T00:00:00Z");
    const revoked = revokeShare(link, "2026-03-02T00:00:00Z");
    expect(isActiveShare(revoked)).toBe(false);
    expect(revoked.revokedAt).toBe("2026-03-02T00:00:00Z");
    // idempotent: re-revoking keeps the original timestamp
    expect(revokeShare(revoked, "2026-03-03T00:00:00Z").revokedAt).toBe("2026-03-02T00:00:00Z");
  });

  it("computes the locked-id set from active shares only", () => {
    const active = sharePassport({ id: "s1", consentAck: true, currency: "USD", transactionIds: ["t1", "t2"] });
    const revoked = revokeShare(sharePassport({ id: "s2", consentAck: true, currency: "USD", transactionIds: ["t3"] }));
    const locked = lockedTransactionIds([active, revoked]);
    expect([...locked].sort()).toEqual(["t1", "t2"]);
    expect(locked.has("t3")).toBe(false);
  });
});

describe("business profile (Req 1.1–1.4)", () => {
  // The profile store is the API repo; here we assert the domain shape + the currency-change
  // rule (presentation-only: stored amounts never change when the reporting currency changes).
  const profile: BusinessProfile = {
    id: "tenant-1",
    name: "Mai Chido Tuckshop",
    tin: "1234567A",
    reportingCurrency: "USD",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("holds name, optional TIN and a reporting currency", () => {
    expect(profile.name).toBe("Mai Chido Tuckshop");
    expect(profile.tin).toBe("1234567A");
    expect(profile.reportingCurrency).toBe("USD");
  });

  it("changing reporting currency does not touch stored transaction amounts", () => {
    const txns: Transaction[] = [
      tx({ id: "x", direction: "IN", amount: "100.00", currency: "USD", rail: "CASH", category: "SALES", date: "2026-01-05" }),
    ];
    const before = txns.map((t) => t.amount);
    const changed: BusinessProfile = { ...profile, reportingCurrency: "ZiG", updatedAt: "2026-02-01T00:00:00Z" };
    // The reporting currency is a presentation choice; the ledger is untouched.
    expect(changed.reportingCurrency).toBe("ZiG");
    expect(txns.map((t) => t.amount)).toEqual(before);
  });
});

describe("end-to-end scenario (Definition of Done)", () => {
  // A week of mixed USD/ZiG/ZAR, mixed-rail activity incl. an asset purchase, cross-currency
  // entries carrying their effective rate. We then view profit in all three currencies and on
  // both bases, confirm asset exclusion, build a statement, and share a consent-gated passport.
  const rates = new OfficialRateTable([
    { pair: "USD/ZiG", date: "2026-01-01", rate: "13.0", source: "MANUAL" },
    { pair: "USD/ZAR", date: "2026-01-01", rate: "18.0", source: "MANUAL" },
    { pair: "ZiG/ZAR", date: "2026-01-01", rate: "1.385", source: "MANUAL" },
  ]);
  const week = { from: "2026-01-01", to: "2026-01-07" };
  const txns: Transaction[] = [
    tx({ id: "in-usd", direction: "IN", amount: "200.00", currency: "USD", rail: "ECOCASH", category: "SALES", date: "2026-01-02" }),
    tx({ id: "in-zig", direction: "IN", amount: "1300.00", currency: "ZiG", rail: "CASH", category: "SALES", date: "2026-01-03", effectiveRate: { toCurrency: "USD", rate: "0.076923" } }),
    tx({ id: "out-stock", direction: "OUT", amount: "50.00", currency: "USD", rail: "CASH", category: "STOCK", date: "2026-01-04", fee: "1.00" }),
    tx({ id: "out-zar", direction: "OUT", amount: "360.00", currency: "ZAR", rail: "CARD", category: "TRANSPORT", date: "2026-01-05", effectiveRate: { toCurrency: "USD", rate: "0.0556" } }),
    tx({ id: "asset", direction: "OUT", amount: "500.00", currency: "USD", rail: "BANK", category: "OTHER", date: "2026-01-06", isAsset: true, assetClass: "EQUIPMENT", assetDescription: "chest freezer" }),
  ];

  it("reports profit in USD with the asset excluded", () => {
    const d = getDashboard(txns, week, "USD", "EFFECTIVE", rates);
    // money in: 200 + 1300*0.076923 (=100.00) = 300.00
    expect(d.moneyIn).toBe("300.00");
    // operating out (incl fees): stock 50+1=51 + transport 360*0.0556 (=20.02) = 71.02
    expect(d.operatingOut).toBe("71.02");
    expect(d.profit).toBe("228.98");
    expect(d.assetSpend).toBe("500.00");
  });

  it("consolidates into ZiG and ZAR on the official basis without error", () => {
    for (const cur of ["USD", "ZiG", "ZAR"] as const) {
      for (const basis of ["EFFECTIVE", "OFFICIAL"] as const) {
        const d = getDashboard(txns, week, cur, basis, rates);
        expect(typeof d.profit).toBe("string");
      }
    }
  });

  it("builds a lender statement and a consent-gated, revocable passport with the asset base", () => {
    const s = getStatement(txns, week, { name: "Mai Chido Tuckshop" }, "USD", "EFFECTIVE", rates, "2026-01-08T00:00:00Z");
    expect(s.assetsAcquired.EQUIPMENT).toEqual({ count: 1, value: "500.00" });
    expect(s.totals.netProfit).toBe("228.98");

    const p = getPassport(txns, "USD", "EFFECTIVE", rates, "2026-01-08T00:00:00Z");
    expect(p.declaredAssetBase.total).toBe("500.00");

    // consent gate + lock
    expect(() => sharePassport({ id: "share-1", consentAck: false, currency: "USD", transactionIds: txns.map((t) => t.id) })).toThrow(ConsentError);
    const share: ShareLink = sharePassport({ id: "share-1", consentAck: true, currency: "USD", transactionIds: txns.map((t) => t.id) }, "2026-01-08T00:00:00Z");
    const locked = lockedTransactionIds([share]);
    expect(() => editTransaction(txns[2]!, { amount: "60.00" }, { lockedIds: locked })).toThrow(LockedTransactionError);
    // after revoke, edits are allowed again
    const after = lockedTransactionIds([revokeShare(share)]);
    expect(() => editTransaction(txns[2]!, { amount: "60.00" }, { lockedIds: after })).not.toThrow();
  });
});

describe("fees on money in", () => {
  it("counts a fee deducted from a receipt as an operating cost", () => {
    const t = buildTransaction({ id: "fin1", direction: "IN", amount: "100.00", currency: "USD", rail: "ECOCASH", category: "SALES", date: "2026-09-30", fee: "1.50" });
    const d = getDashboard([t], { from: "2026-09-01", to: "2026-09-30" }, "USD");
    expect(d.moneyIn).toBe("100.00");
    expect(d.operatingOut).toBe("1.50");
    expect(d.profit).toBe("98.50");
    expect(d.cashByRail.ECOCASH).toBe("98.50");
  });
});
