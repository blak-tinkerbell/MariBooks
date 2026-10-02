import { describe, expect, it } from "vitest";
import { parseMoneySms } from "./sms.js";
import { buildTransaction } from "./ledger.js";

describe("parseMoneySms", () => {
  it("reads a mobile-money receipt as money in", () => {
    const d = parseMoneySms(
      "EcoCash: You have received USD 25.00 from TENDAI MOYO 0771234567. Approval Code: MP260930.1234.A56789. New wallet balance: USD 140.50",
    );
    expect(d).toMatchObject({ amount: "25.00", currency: "USD", direction: "IN", rail: "ECOCASH", confidence: "HIGH" });
    expect(d.reference).toBe("MP260930.1234.A56789");
  });

  it("never reads the running balance as the amount", () => {
    const d = parseMoneySms("Balance: USD 900.00. You have received USD 12.00 via InnBucks");
    expect(d.amount).toBe("12.00");
    expect(d.rail).toBe("INNBUCKS");
  });

  it("separates the fee and IMTT from the principal on money out", () => {
    const d = parseMoneySms(
      "Transfer confirmed. You paid ZWG 1,240.00 to Musa Wholesale on 28/09/2026. Charge: ZWG 12.40 IMTT: ZWG 24.80 Ref 7HX2K9",
    );
    expect(d).toMatchObject({ amount: "1240.00", currency: "ZiG", direction: "OUT", fee: "12.40", imtt: "24.80", date: "2026-09-28" });
    expect(d.counterparty).toBe("Musa Wholesale");
  });

  it("handles rand with an R prefix and a bank rail", () => {
    const d = parseMoneySms("CBZ: Your account was credited with R540.00 from J Ndlovu");
    expect(d).toMatchObject({ amount: "540.00", currency: "ZAR", direction: "IN", rail: "BANK" });
  });

  it("marks incomplete messages as low confidence instead of guessing", () => {
    const d = parseMoneySms("Thank you for using our service");
    expect(d.confidence).toBe("LOW");
    expect(d.amount).toBeUndefined();
    expect(d.direction).toBeUndefined();
  });
});

describe("small effective rates", () => {
  it("accepts a market rate below 0.01 (e.g. 1 ZiG = 0.0365 USD)", () => {
    const t = buildTransaction({
      id: "r1", direction: "IN", amount: "100.00", currency: "ZiG", rail: "CASH", category: "SALES",
      date: "2026-09-30", effectiveRate: { toCurrency: "USD", rate: "0.00365" },
    });
    expect(t.effectiveRate?.rate).toBe("0.00365");
  });
});
