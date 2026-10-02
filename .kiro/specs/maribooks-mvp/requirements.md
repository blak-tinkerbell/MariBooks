# MariBooks — Requirements

## Problem Statement

Zimbabwean small and micro businesses run on money that moves across **many currencies
and many payment rails** — USD and ZiG, held and settled through cash, EcoCash, OneMoney,
InnBucks, Zipit, bank and card. In a fluctuating economy with little to no formal banking,
owners keep their books on scraps of paper or in their heads. The result is threefold:

1. **Capture is hard and lossy.** Money in and money out spans currencies, rails, fees and
   IMTT charges that are never recorded honestly, so owners cannot tell what they actually
   earned.
2. **There is no single view of the money.** Because value sits in several currencies at once
   (USD, ZiG and, in parts of the country, ZAR) — often exchanged at a market rate that differs
   from the official one — owners cannot see, in one currency of their choice, whether the
   business is making money.
3. **There is no trusted financial record.** With no consolidated record from a system of
   record they can trust, owners cannot prove a track record — so they are locked out of
   borrowing to grow.

MariBooks solves this by letting an owner capture mixed-currency, mixed-rail money movement
in seconds, keep it as honest records in the currency it happened, view profit in USD or ZiG,
and turn that record into a trusted, shareable statement and credit passport that unlocks
credit. It works on a low-end phone, over a low-bandwidth connection, in the owner's language.

---

## Personas
- **Micro-trader / growing SME owner** — the primary user. Uses a low-end
  Android phone, trades in USD and ZiG across cash, EcoCash, OneMoney, InnBucks, Zipit,
  bank and card, and wants to (a) capture money in/out fast, (b) know if they are making
  money, and (c) prove their track record to a lender.

---

## Requirements

### Requirement 1 — Business identity & single-owner setup
**User story:** As an owner, I want to set up my business once, so that my records belong
to me and I can share them deliberately.

#### Acceptance Criteria
1. WHEN the app is first launched THEN the system SHALL let the owner create a business
   profile with name, an optional TIN/BP number, and a chosen reporting currency (USD or ZiG).
2. THE system SHALL support one business and one contact person.
3. WHEN the business profile is saved THEN the system SHALL persist it to the backing store so
   it is available on the next launch.
4. THE system SHALL allow the owner to change the default reporting currency at any time
   without altering any originally captured amounts.

### Requirement 2 — Multi-currency, multi-rail transaction capture
**User story:** As an owner, I want to record a sale or an expense in two taps in the
currency and payment method it actually happened, so that capture is effortless and honest.

#### Acceptance Criteria
1. WHEN the owner records a transaction THEN the system SHALL capture: direction (money in
   / money out), amount, currency (USD, ZiG or ZAR), payment rail, date, and an optional note.
2. THE system SHALL offer these payment rails: cash, EcoCash, OneMoney, InnBucks, Zipit,
   bank transfer, and card.
3. THE system SHALL store every amount in the **original currency it occurred in** and
   SHALL NOT silently convert or mix currencies at capture time.
4. WHEN a transaction is recorded THEN the system SHALL complete capture of a
   money-in or money-out entry in **two primary taps or fewer** beyond entering the amount.
5. WHEN a payment rail carries a fee or an IMTT (Intermediated Money Transfer Tax) charge
   THEN the system SHALL allow the fee/IMTT to be recorded against the transaction and
   SHALL keep it distinct from the principal amount.
6. THE system SHALL let the owner categorise a transaction with a simple income or expense
   category (e.g. sales, stock/inputs, rent, transport, wages, fees, other).
7. WHEN the owner records a money-out transaction THEN the system SHALL allow it to be flagged
   as an **asset purchase**, and WHEN so flagged SHALL let the owner choose an asset class
   (e.g. equipment, vehicle, tools, furniture, property, other) — see Requirement 9.
8. THE system SHALL allow a captured transaction to be edited or deleted before it is
   included in a shared statement.

### Requirement 3 — Multi-currency FX: owner-entered effective rate + official reference rate
**User story:** As an owner, I want my numbers to reflect the rate I actually transacted at
(the prevailing market rate), while still being able to produce statutory reports at the
official rate, so that my books are honest and my filings are defensible.

The reality in Zimbabwe is that the street/effective rate an owner actually uses often differs
from the official/interbank rate. MariBooks captures **both truths**: the owner enters the
effective rate they transacted at (drives what the owner sees), and the system maintains an
official reference-rate table (drives statutory-styled reports). Currencies supported: **USD,
ZiG and ZAR**.

#### Acceptance Criteria
1. WHEN a transaction's currency differs from the owner's reporting currency THEN the system
   SHALL let the owner **enter the prevailing (effective) exchange rate they transacted at**
   for that transaction's date, and SHALL store that rate with the transaction.
2. THE system SHALL pre-fill the effective rate with the most recent rate known for that
   currency pair and date as a convenience, while allowing the owner to override it.
3. THE system SHALL maintain a separate **dated official/reference rate table** for each
   currency pair (e.g. USD⇄ZiG, USD⇄ZAR, ZiG⇄ZAR) for statutory-styled reporting.
4. WHEN the owner requests a report THEN the system SHALL let them choose the **rate basis**:
   the **effective rate (as entered)** — the default for the owner's own view — or the
   **official/reference rate** — for statutory-styled statements.
5. WHEN translating for a report THEN the system SHALL translate each non-matching transaction
   using the chosen rate basis dated to that transaction, leaving matching-currency amounts
   unchanged.
6. THE system SHALL allow the owner to toggle any report between USD, ZiG and ZAR without
   re-entering data.
7. THE system SHALL allow manual entry or override of an official/reference rate for a date and
   SHALL retain full rate history for both effective and official rates.
8. THE system SHALL clearly label every reported figure with the **rate basis and rate dates**
   used, SHALL display a "confirm the applicable ZIMRA/reference rate" note where the official
   basis is used, and SHALL never present a street/effective rate as the statutory basis.

### Requirement 4 — Financial health dashboard
**User story:** As an owner, I want a plain-language view of whether I am making money,
so that I can make decisions without knowing accounting.

#### Acceptance Criteria
1. WHEN the owner opens the dashboard THEN the system SHALL show, in the reporting currency:
   money in, money out, and profit for a selected period (this week, this month).
2. THE system SHALL present profit in plain language (e.g. "You made X this week").
3. THE system SHALL show the current cash position by payment rail (how much is in cash,
   EcoCash, bank, etc.).
4. THE dashboard SHALL update immediately after any transaction is captured, edited, or deleted.
5. WHEN transactions exist in more than one currency (USD, ZiG, ZAR) THEN the dashboard SHALL
   still present a single consolidated figure in the chosen reporting currency using
   Requirement 3 rates (effective basis by default for the owner's view).

### Requirement 5 — Lender-ready statements & export
**User story:** As an owner, I want to produce a clean statement of my activity, so that a
lender can trust my track record.

#### Acceptance Criteria
1. THE system SHALL produce a statement covering a chosen date range containing: total
   money in, total money out, net profit, and a breakdown by category and by payment rail.
2. THE system SHALL render the statement in the chosen reporting currency (USD, ZiG or ZAR)
   and SHALL state the rate basis (effective or official) and rate dates used for any
   translation.
3. THE system SHALL allow the owner to export the statement as a PDF (or printable/shareable
   document).
4. THE statement SHALL show the business name and the period, and SHALL be generated from
   the ledger without manual re-keying.
5. THE system SHALL generate a statement using only records the owner has explicitly chosen
   to include in the selected date range.

### Requirement 6 — Credit passport summary (trusted track record)
**User story:** As an owner, I want a shareable summary of my track record, so that I can
prove I am creditworthy and borrow to grow.

#### Acceptance Criteria
1. THE system SHALL compute a credit-passport summary from captured records containing at
   least: total verified turnover over the period, average monthly turnover, a cash-flow
   stability indicator, the number of days/weeks of continuous records, and a **declared asset
   base** (total value of transactions flagged as asset purchases, by asset class — see
   Requirement 9) as a collateral signal.
2. THE system SHALL present the passport as a read-only, plain-language summary in the
   chosen reporting currency.
3. WHEN the owner chooses to share the passport THEN the system SHALL require an explicit,
   revocable consent action before producing a share link or shareable document.
4. THE system SHALL derive the passport only from the owner's own captured data and SHALL
   NOT include any data the owner has not entered.
5. THE passport SHALL show the record period and a generated date so a reader can judge
   recency and coverage.

### Requirement 7 — Reliable capture & data durability (online)
**User story:** As an owner, I want my records saved reliably and never lost, so that I can
trust the books even on a slow or briefly interrupted connection.

#### Acceptance Criteria
1. WHEN the owner submits a transaction THEN the system SHALL persist it to the backing store
   and SHALL confirm success before treating the record as saved.
2. WHEN a save request fails due to a transient network error THEN the system SHALL retry and
   SHALL surface a clear error if the record could not be saved, without silently dropping it.
3. THE system SHALL indicate save/sync status to the owner (saved vs. in progress vs. failed).
4. THE system SHALL be usable on low-bandwidth connections (2G/3G), keeping payloads small and
   capture responsive.

> Note: full offline-first operation (local-first capture with background sync) is a design
> principle of the wider product and is deferred beyond this release. This release assumes an
> available network connection at capture time.

### Requirement 8 — Localization & money presentation (minimum)
**User story:** As an owner, I want money and language shown plainly, so that the app is
easy to use.

#### Acceptance Criteria
1. THE system SHALL display currency amounts with an explicit currency label (USD, ZiG or ZAR)
   so no amount is ambiguous.
2. THE system SHALL support English at launch, with the UI text structured for later
   translation to Shona and Ndebele (strings externalized, not hard-coded).
3. THE system SHALL use clear icons and large tap targets suitable for low-end devices and
   low-literacy users.

### Requirement 9 — Asset register (fundable assets)
**User story:** As an owner, I want the things I buy that are assets (equipment, a vehicle,
tools) recorded as assets, so that I can show what I own and use it to secure funding.

#### Acceptance Criteria
1. WHEN an expense is flagged as an asset purchase (Requirement 2.7) THEN the system SHALL
   record it in an **asset register** with: description, asset class, acquisition amount and
   currency, acquisition date, and a link back to the originating transaction.
2. THE system SHALL keep asset purchases distinct from ordinary operating expenses in
   reporting, so profit is not distorted by treating a capital purchase as a running cost.
3. THE system SHALL show a summary of the asset base (total declared asset value, by class, in
   the chosen reporting currency) that the owner can review and include in the credit passport.
4. THE system SHALL allow the owner to edit an asset's details or unflag a transaction as an
   asset before it is included in a shared statement or passport.
5. THE asset base presented is **owner-declared** (acquisition cost of captured purchases); the
   system SHALL label it as such and SHALL NOT assert a verified market/collateral valuation.

### Requirement 10 — Proof of transactions (invoice/receipt uploads)

**User story:** As an owner, I want to attach the invoice or receipt behind an entry, so that
my records are verifiable and a lender can trust them — not just take my word.

#### Acceptance Criteria
1. WHEN the owner records or edits a transaction THEN the system SHALL allow them to attach one
   invoice or receipt file (image or PDF) as proof, stored privately and linked to the entry.
2. THE system SHALL upload the file directly from the browser to private, encrypted object
   storage using a short-lived, scoped credential, so the file does not pass through the API,
   and SHALL confine every file to the owner's own namespace.
3. WHEN a proof file is attached THEN the system MAY use a document-AI service (Amazon Textract
   `AnalyzeExpense`) to extract the total, date and vendor to prefill the capture form; the
   extracted values SHALL be re-validated against the domain and the owner SHALL confirm before
   saving. Extraction is best-effort — if it is unavailable or low-confidence, the file still
   attaches and the owner fills the form by hand.
4. WHEN viewing a statement THEN the system SHALL indicate how many entries are backed by proof
   and SHALL let the owner (or a consented lender) open each attached file via a short-lived
   link.
5. THE system SHALL keep proof files subject to the same ownership and consent rules as the
   records they back; files are private by default and never publicly readable.

---

## Non-Functional Requirements
- **Low-end device & low-data:** usable on entry-level devices and browsers; sub-second
  capture; minimal data usage; responsive on 2G/3G.
- **Data ownership:** every share (statement, passport) is explicit and revocable; nothing
  is shared without an owner action.
- **Honest, owner-driven FX:** the owner enters the prevailing (effective) rate they actually
  transacted at, which drives their own view; a separate maintained official/reference rate
  table drives statutory-styled reports. No rate is hard-coded, every figure discloses its rate
  basis, and market rates are never presented as the statutory basis. No statutory tax is
  computed (a "verify with ZIMRA/advisor" note accompanies official-basis figures).
- **Security:** data encrypted at rest (customer-managed keys) and in transit (TLS); access to
  financial data requires authentication; least-privilege throughout.
- **Trust of records:** the credit passport and statements are generated only from the
  owner's captured data, with dates and rate basis disclosed.
