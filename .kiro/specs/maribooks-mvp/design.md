# MariBooks MVP — Design

## Overview

The product is a **single-surface web app** (React SPA) backed by an authenticated
serverless service on AWS that holds the durable record. It implements one clean thread from the Product Concept: capture
mixed-currency, mixed-rail money movement → keep it as honest double-entry in original
currency → report and translate it into a chosen currency → surface profit → export a
lender-ready statement and a shareable credit passport.

The design keeps the **shared financial core** (ledger, FX engine, payment-rail engine) as
the durable foundation the concept intends, while deferring every compliance, AI, and lender
module. Nothing in the MVP contradicts the full architecture; the deferred modules plug into
the same core later.

### Design goals
- **Two-tap capture** and sub-second responsiveness on low-end devices.
- **No currency ambiguity:** amounts are stored in the currency they occurred in; translation
  happens only at report time, at dated rates.
- **Trustworthy records:** statements and the passport are derived purely from captured data,
  with rate basis and dates disclosed.
- **Reliable capture, cloud-authoritative:** the app persists each capture to the
  authenticated backend and confirms success before treating it as saved; transient failures
  are retried and surfaced, never silently dropped. DynamoDB is the durable system of record.
  (Full offline-first operation is a wider-product principle, deferred beyond this release.)

### Non-goals (MVP)
Fiscalisation, tax computation/filing, invoicing, stock, loans, payroll, client accounts,
lender console, AI/OCR, USSD/WhatsApp, multi-business, multi-user.

---

## Architecture

The delivered product is a **web app (React SPA) deployed on AWS serverless**. The SPA calls
the authenticated serverless API over HTTPS; the API persists to DynamoDB, the durable system
of record.

```
                         Browser (React SPA)
┌───────────────────────────────────────────────────────────────┐
│  Capture UI ──► API Client ──┐                                  │
│  Dashboard  ◄── Reporting ◄──┤   (domain logic in shared TS)    │
│  Statement  ◄── FX Engine  ◄─┤                                  │
│  Passport   ◄── Passport   ◄─┘                                  │
└────────────────────┼────────────────────────────────────────────┘
        served by     │  HTTPS (authenticated, JWT)
   ┌─────────────┐    │
   │ CloudFront  │    │        ┌──────────────────┐
   │  + S3 (SPA) │    └───────►│ API Gateway       │  HTTP API
   └─────────────┘             │ (HTTP API + JWT)  │
        ▲                      └────────┬──────────┘
        │ public URL                    │
     judges / AI                 ┌──────▼──────┐
                                 │  Lambda      │  Node.js 18, zip
                                 │  (API)       │
                                 └──────┬──────┘
                                        │
                                 ┌──────▼──────┐
                                 │  DynamoDB    │  single-table,
                                 │              │  per-tenant items
                                 └──────────────┘
```

- **Cloud-authoritative:** DynamoDB is the durable system of record. Each capture is persisted
  server-side and confirmed before the UI treats it as saved.
- **Reliable capture:** transient network failures are retried with backoff and surfaced to the
  owner (saved / in progress / failed); nothing is silently dropped.
- **Idempotent writes:** client-generated transaction IDs let the API use a conditional upsert,
  so a retried request never creates a duplicate.
- **FX Engine** is pure/deterministic: given a transaction and a dated rate table, it
  produces a translated amount. It never mutates stored transactions. It can run client-side
  for instant report toggling and server-side for authoritative statements.

> **Offline note.** Full offline-first operation (local-first capture with background sync) is
> a design principle of the wider MariBooks product and is **deferred beyond this release**.
> This release assumes a network connection at capture time. The architecture leaves room to
> add a local store + outbox later without changing the API contract (IDs are already
> client-generated and writes are idempotent).

### Technology stack (as built)
- **Frontend:** React + TypeScript + Vite. Domain logic (money, FX, ledger aggregation,
  passport) lives in shared TypeScript modules the SPA imports directly, so reports and the
  currency toggle compute instantly in the browser. A typed API client handles auth and
  retries.
- **Backend:** Amazon API Gateway (HTTP API) → AWS Lambda (Node.js 18, zip package — no
  container/Docker dependency) → Amazon DynamoDB (single-table design).
- **Hosting / public URL:** SPA static assets in Amazon S3, served through Amazon CloudFront
  (the public URL judges and the AI scoring system reach).
- **Infrastructure as code:** AWS SAM (`template.yaml`) provisions API Gateway, Lambda,
  DynamoDB, S3 and CloudFront, and outputs the API endpoint and the CloudFront URL.
- **Region:** af-south-1 (Cape Town — closest to the Zimbabwean user base; overridable at deploy time).

### DynamoDB single-table design
| Attribute | Purpose |
|---|---|
| `PK` = `TENANT#<tenantId>` | partition per business |
| `SK` = `TXN#<txnId>` / `ORATE#<pair>#<date>` / `PROFILE` | item type + id |
| `type` | `TRANSACTION` \| `OFFICIAL_RATE` \| `PROFILE` |
| payload attributes | transaction (incl. effective rate + asset fields) / official-rate / profile fields |
- Idempotent write: `PutItem` keyed by `PK`+`SK` (client-generated `txnId`) — retries never
  duplicate. Query by `PK` + `begins_with(SK, "TXN#")` lists a tenant's ledger.

---

## Components and Interfaces

### 1. Business Profile Service (Req 1)
Owns the single business profile and default reporting currency.
```
BusinessProfile {
  id: string
  name: string
  tin?: string
  reportingCurrency: Currency        // default; changeable, never rewrites tx
  createdAt: ISODate
}
getProfile(): BusinessProfile | null
saveProfile(p): void
setReportingCurrency(c): void        // affects presentation only
```

### 2. Ledger Service (Req 2, 7) — F1 + F2
The heart. Records transactions in original currency with rail, fee/IMTT, and category.
Internally double-entry, but the API is action-shaped ("money in" / "money out").
```
type Direction = "IN" | "OUT"
type Currency  = "USD" | "ZiG" | "ZAR"
type Rail = "CASH" | "ECOCASH" | "ONEMONEY" | "INNBUCKS" | "ZIPIT" | "BANK" | "CARD"
type Category = "SALES" | "STOCK" | "RENT" | "TRANSPORT" | "WAGES" | "FEES" | "OTHER"
type AssetClass = "EQUIPMENT" | "VEHICLE" | "TOOLS" | "FURNITURE" | "PROPERTY" | "OTHER"

Transaction {
  id: string            // client-generated UUID (idempotency key for sync)
  direction: Direction
  amount: Decimal       // principal, in `currency`
  currency: Currency
  rail: Rail
  fee?: Decimal         // rail fee, same currency, distinct from principal
  imtt?: Decimal        // IMTT charge, same currency, distinct from principal
  category: Category
  date: ISODate
  note?: string
  // owner-entered effective (street) rate used for THIS transaction, when cross-currency:
  effectiveRate?: {                 // omitted when currency == reportingCurrency
    toCurrency: Currency            // the currency this rate converts INTO
    rate: Decimal                   // 1 unit of `currency` = `rate` units of toCurrency
  }
  // asset tagging (money-out only):
  isAsset?: boolean
  assetClass?: AssetClass           // required when isAsset === true
  createdAt: ISODate
  updatedAt: ISODate
}

addTransaction(input): Transaction     // ≤ two taps beyond amount entry
editTransaction(id, patch): Transaction // allowed while not in a shared statement
deleteTransaction(id): void
listTransactions(range): Transaction[]
```
Design notes:
- **Fees and IMTT are stored as separate fields**, not folded into the principal, so profit
  and cash position stay honest (Req 2.5, 4.3).
- **Effective rate is per-transaction and owner-entered** (Req 3.1): it captures the street
  rate actually used, and is stored on the transaction so the owner's own reports reflect real
  economics. The UI pre-fills it from the last known rate but the owner can override.
- **Asset flag** (Req 2.7, Req 9): a money-out entry can be marked `isAsset` with an
  `assetClass`; the Asset Register (component 8) reads these.
- Decimal arithmetic only (no floats) to avoid money rounding errors.

### 3. FX Engine (Req 3) — F6 (dual-basis, multi-currency)
Handles Zimbabwe's reality that the **street/effective rate differs from the official rate**.
Two rate bases:
- **EFFECTIVE** — the rate the owner actually transacted at, stored per-transaction
  (`Transaction.effectiveRate`). Drives the owner's own reports. Authoritative for what the
  owner sees.
- **OFFICIAL** — a maintained, dated reference-rate table per currency pair, used for
  statutory-styled reports.

```
type Pair = "USD/ZiG" | "USD/ZAR" | "ZiG/ZAR"   // stored canonically; inverse computed
type RateBasis = "EFFECTIVE" | "OFFICIAL"

OfficialRate { pair: Pair, date: ISODate, rate: Decimal, source: "FEED" | "MANUAL", note: string }
OfficialRateTable {
  getRateForDate(pair, date): OfficialRate   // most recent on/before date
  upsertManualRate(pair, date, rate): void
  history(pair?): OfficialRate[]
}

// EFFECTIVE basis: uses the rate stored on the transaction.
// OFFICIAL  basis: looks up the dated official-rate table.
translate(txn, to: Currency, basis: RateBasis): {
  value: Decimal, rateUsed: Decimal, rateDate: ISODate, basis: RateBasis
}
```
Design notes:
- Matching-currency amounts pass through untouched.
- **EFFECTIVE** is the default for the owner's dashboard and their own statements (real
  economics). **OFFICIAL** is selected for statutory-styled statements.
- If a transaction has no stored effective rate (e.g. legacy/edge), the engine falls back to
  the official table for that date and labels it accordingly.
- For OFFICIAL, when no rate exists for the exact date, use the most recent prior rate and
  surface its date. A "confirm the applicable ZIMRA/reference rate" note accompanies
  official-basis figures (Req 3.8).
- **A street/effective rate is never presented as the statutory basis;** the basis label
  travels with every translated figure.

### 4. Reporting Service (Req 4, 5, 9) — S6 + S8
Aggregates the ledger into the dashboard and statements, in the chosen reporting currency and
**rate basis** (EFFECTIVE by default; OFFICIAL for statutory-styled reports).
```
getDashboard(period, reportingCurrency, basis = "EFFECTIVE"): {
  moneyIn: Decimal, moneyOut: Decimal, profit: Decimal,   // profit excludes asset purchases
  assetSpend: Decimal,                     // capital out, reported separately (Req 9.2)
  cashByRail: Map<Rail, Decimal>,          // net position per rail (incl. asset purchases)
  plainLanguageSummary: string,            // "You made X this week"
  rateBasis: { basis: RateBasis, note: string, ratesUsed: { pair, rate, date }[] }
}

getStatement(range, reportingCurrency, basis = "EFFECTIVE"): {
  business: { name, tin? },
  period: { from, to },
  totals: { moneyIn, operatingOut, netProfit, assetSpend },  // assets kept out of profit
  byCategory: Map<Category, {in, out}>,
  byRail: Map<Rail, {in, out}>,
  assetsAcquired: Map<AssetClass, { count, value }>,         // capital summary
  rateBasis: { basis, note, ratesUsed },
  generatedAt: ISODate
}

exportStatementPdf(statement): FileRef      // printable/shareable document
```
Design notes:
- **Operating vs capital split (Req 9.2):** money-out flagged `isAsset` is excluded from
  operating expense and profit, and reported as `assetSpend` / `assetsAcquired`, so a capital
  purchase doesn't distort profit.
- Cash-by-rail is computed from IN minus OUT (including fees/IMTT **and** asset purchases) per
  rail, so it reflects real balances (buying an asset does reduce cash).
- The reporting-currency and rate-basis toggles re-run aggregation through the FX Engine;
  captured data is never rewritten (Req 3.5, 3.6, 4.5). Every figure carries its basis label.

### 5. Credit Passport Service (Req 6) — S9 (summary)
Derives a trustworthy, shareable summary from captured data only.
```
getPassport(reportingCurrency): {
  periodCovered: { from, to },
  totalTurnover: Decimal,             // verified = sum of captured money-in
  avgMonthlyTurnover: Decimal,
  cashFlowStability: "STRONG" | "MODERATE" | "VARIABLE",  // from monthly variance
  continuousRecordDays: number,
  declaredAssetBase: {                // collateral signal (Req 6.1, Req 9.3)
    total: Decimal,
    byClass: Map<AssetClass, Decimal>,
    label: "Owner-declared acquisition cost"   // not a verified market valuation
  },
  generatedAt: ISODate
}
sharePassport(consentAck: boolean): ShareLink   // requires explicit consent
revokeShare(shareId): void
```
Design notes:
- `cashFlowStability` is a simple derived indicator (e.g. coefficient of variation of
  monthly net cash flow bucketed into three bands). Kept explainable, not a black-box score.
- `declaredAssetBase` comes from the Asset Register (component 8) and is labelled as
  owner-declared acquisition cost — a collateral **signal**, not an appraised valuation
  (Req 9.5).
- No data the owner did not enter is ever included (Req 6.4). Sharing is gated on explicit,
  revocable consent (Req 6.3) and every share is logged.

### 6. API Client (Req 7)
Typed client the SPA uses to talk to the authenticated API, with reliable-capture semantics.
```
type SaveState = "SAVING" | "SAVED" | "FAILED"

putTransaction(txn): Promise<{ state: SaveState }>   // retry w/ backoff on transient errors
listTransactions(range): Promise<Transaction[]>
putOfficialRate(pair, date, rate): Promise<void>     // maintain official reference table
getOfficialRates(pair?): Promise<OfficialRate[]>
getProfile() / putProfile(p): Promise<...>
```
- Attaches the Cognito JWT to every request; refreshes/redirects to sign-in on 401.
- Retries transient failures (network, 5xx, throttling) with backoff; on final failure returns
  `FAILED` so the UI can show it — never silently drops a record.
- Writes are idempotent by client-generated `Transaction.id` (server conditional upsert), so a
  retried request never creates a duplicate.

### 8. Asset Register (Req 9) — derived from the ledger
Not a separate store — a projection over transactions flagged `isAsset`, plus optional
edited detail. Keeps capital purchases distinct from operating expenses and feeds the passport.
```
AssetItem {
  transactionId: string      // link back to the originating money-out transaction
  description: string
  assetClass: AssetClass
  amount: Decimal            // acquisition cost, in `currency`
  currency: Currency
  acquiredOn: ISODate
}

listAssets(): AssetItem[]                        // all isAsset transactions
assetSummary(reportingCurrency, basis): {        // for dashboard / passport
  total: Decimal, byClass: Map<AssetClass, Decimal>
}
```
Design notes:
- The register is **owner-declared** (acquisition cost of captured purchases); labelled as such,
  never presented as a verified market/collateral valuation (Req 9.5).
- Editing/unflagging is allowed until the item is part of a shared statement/passport (Req 9.4).

### 9. Localization (Req 8)
- All display strings externalized into a resource bundle (English at launch; keys ready
  for Shona/Ndebele).
- Currency values always rendered with an explicit `USD` / `ZiG` / `ZAR` label via a single
  money formatter used everywhere; every translated figure also shows its rate basis.

---

## Data Model (authoritative store — DynamoDB)

Logical records (physically stored in the DynamoDB single table described above).

```
business_profile(id, name, tin, reporting_currency, created_at, updated_at)
transaction(id, direction, amount, currency, rail, fee, imtt, category,
            date, note,
            effective_rate_to, effective_rate,     // owner-entered street rate (nullable)
            is_asset, asset_class, asset_description,  // asset tagging (nullable)
            created_at, updated_at)
official_rate(pair, date, rate, source, note)      // reference table; PK = pair+date
share_link(id, kind, created_at, revoked_at)       // kind = STATEMENT | PASSPORT
```
- Money stored as integer minor units or decimal strings — never binary floats.
- `currency` ∈ {USD, ZiG, ZAR}. `official_rate.pair` is stored canonically (inverse computed).
- `effective_rate*` holds the owner-entered rate for cross-currency transactions; when the
  transaction currency equals the reporting currency these are null.
- The asset register is a projection over `transaction` rows where `is_asset = true` (no
  separate table needed).
- `transaction.id` and `share_link.id` are client-generated UUIDs used as the idempotency key
  for the server-side conditional upsert (a retried write never duplicates).
- `updated_at` supports last-write-wins on edits.

---

## Money & Currency Handling (cross-cutting)

- **Store native, translate late.** A transaction is immutable in its original currency;
  reporting-currency figures are computed on demand.
- **Fees / IMTT are first-class** and always separate from principal.
- **Dated rates.** Every translation records the rate and its date; statements and dashboards
  disclose the rate basis.
- **Decimal-safe arithmetic** throughout; round only at presentation.

---

## Error Handling

| Situation | Handling |
|---|---|
| No rate for a transaction's date | Fall back to most recent prior rate; label the rate date; if none exists, prompt owner to enter a rate. |
| Transient save failure (network / 5xx / throttle) | Retry with backoff; show "saving"; on final failure show "failed" and keep the entry so the owner can retry — never silently drop. |
| Duplicate/retried write | Idempotent conditional upsert by client ID; never creates a duplicate. |
| Expired session (401) | Prompt re-authentication; preserve the unsaved entry until the owner is signed back in. |
| Invalid amount (≤0, wrong format) | Block save with inline validation. |
| Share without consent | Refuse to generate a link until explicit consent acknowledged. |

---

## Testing Strategy

- **Unit:** FX translation both bases (effective per-txn vs official dated lookup, fallback,
  pass-through), fee/IMTT separation, asset spend excluded from profit, asset summary by class,
  passport stability banding, decimal rounding.
- **Integration:** capture (incl. effective rate + asset flag) → dashboard update; capture →
  statement export; retried write → no duplicate (idempotency by ID); expired-session flow
  preserves the unsaved entry.
- **Scenario (maps to Definition of Done):** capture a week of mixed USD/ZiG/ZAR, mixed-rail
  activity including an asset purchase, each with the effective rate entered; verify profit in
  USD, ZiG and ZAR and on both rate bases; confirm the asset purchase is excluded from profit
  and shows in the asset base; export a lender-ready statement; and generate + share a credit
  passport (with the declared asset base) with consent.
- **Browser/device:** smoke test on a low-end device profile / throttled (2G/3G) network in the
  browser for capture latency and reliable-save behavior.

---

## Traceability (requirement → component)

| Requirement | Component(s) |
|---|---|
| R1 Business identity | Business Profile Service |
| R2 Multi-currency/rail capture (+ asset flag) | Ledger Service |
| R3 FX: effective + official basis (USD/ZiG/ZAR) | FX Engine + Official Rate Table |
| R4 Financial health dashboard | Reporting Service |
| R5 Lender-ready statements | Reporting Service (+ PDF export) |
| R6 Credit passport (+ declared asset base) | Credit Passport Service |
| R7 Reliable capture & durability | API Client (retry/idempotency) + DynamoDB (PITR) |
| R8 Localization & money presentation | Localization + money formatter |
| R9 Asset register (fundable assets) | Asset Register + Ledger Service |
