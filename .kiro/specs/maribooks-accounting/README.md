# MariBooks — Phase 2 spec: double-entry accounting modules

This spec defines the next phase of MariBooks: evolving the current capture-and-report tool into
a true double-entry bookkeeping system for SMMEs, while keeping the two-tap capture experience
that owners already use.

> **Status: planned (not yet implemented).** Phase 1 (the live app) records single-sided money
> in / money out with categories and derives a dashboard, statement of comprehensive income, and
> credit passport. The modules below require a general ledger with debits and credits, which is a
> new engine layered under the existing capture UI. This document scopes that work so it can be
> built and reviewed as its own phase.

## Why this is a new phase, not a patch

The current domain stores **single-sided transactions** (one amount, one direction, one
category). A trial balance, a suspense account, a cashbook, and bank reconciliation only have
meaning in a **double-entry** system where every event posts equal debits and credits across
named ledger accounts. So the foundation below (chart of accounts + journal postings) must land
first; the rest build on it. The existing transactions are preserved and **mapped into
postings**, never discarded.

---

## Module 1 — General ledger foundation (prerequisite)

**Goal:** a chart of accounts and double-entry postings that every other module uses.

- **Chart of accounts (COA):** a seeded, editable list of accounts, each with a code, name, and
  type — ASSET, LIABILITY, EQUITY, INCOME, EXPENSE. A sensible SMME default set ships out of the
  box (e.g. Cash on hand, Bank, Inventory, Capital expenditure/APEX, Sales, Rent, Wages,
  Transport, Bank fees, IMTT, Owner's equity, Trade receivables/debtors, Trade payables).
- **Journal entry:** a dated entry with two or more lines; each line debits or credits one
  account for an amount in a currency; the entry is only valid when total debits = total credits
  (per currency). Decimal-safe BigInt maths, as today.
- **Mapping existing captures → postings:** each current transaction becomes a journal entry.
  Examples (reporting currency aside):
  - Sale (money in, SALES): Dr Cash/Bank/rail, Cr Sales.
  - Inventory purchase (money out, STOCK): Dr Inventory, Cr Cash/Bank; fees/IMTT Dr Bank fees / IMTT.
  - Capital expenditure (APEX, isAsset): Dr the capex asset account, Cr Cash/Bank.
  - Month-end account client settlement: Dr Cash/Bank, Cr Trade receivables.
- **Acceptance:** every posting balances; the sum of all account balances is zero (the
  accounting identity); existing captures reconcile to the same totals the current dashboard shows.

## Module 2 — Trial balance + suspense account

**Goal:** prove the books balance, and never block the owner when they don't yet.

- **Trial balance:** a report listing every account with its debit or credit balance for a
  period, with column totals that must be equal.
- **Suspense account:** a system account that absorbs any difference so the trial balance always
  balances while the owner is still entering data. When an entry can't be fully classified (e.g.
  a bank line with no matching record yet), the unmatched amount posts to **Suspense** rather
  than being dropped.
- **Clear-the-suspense workflow:** a screen listing everything sitting in Suspense with a prompt
  to reclassify each item to a real account; the trial balance shows a green "balanced, suspense
  = 0" state once cleared.
- **Acceptance:** TB debit total = credit total at all times; any imbalance is visible as a
  Suspense balance with a one-click path to resolve it; nothing is ever silently discarded.

## Module 3 — Cashbook

**Goal:** a running record of cash/bank movements per account, the owner's day-to-day view.

- A per-account (per rail/bank) chronological list of receipts and payments with a running
  balance, filterable by period and currency.
- Derived from the ledger postings that touch cash/bank accounts, so it always agrees with the
  trial balance and the statement.
- **Acceptance:** the cashbook closing balance for an account equals that account's balance in
  the trial balance for the same period.

## Module 4 — Bank reconciliation

**Goal:** match the cashbook to the bank's own record and explain any difference.

- Import or paste a bank statement (reuse the SMS/receipt-reading approach: a tolerant parser,
  optional AI assist, always owner-confirmed).
- Match bank lines to cashbook entries (auto-match on amount + date within a window; manual match
  for the rest); mark items as reconciled.
- Produce a **reconciliation statement**: cashbook balance, add/less unpresented items and
  outstanding deposits, = bank statement balance. Unmatched bank lines can post to Suspense
  (Module 2) until classified.
- **Acceptance:** after reconciliation, cashbook balance + reconciling items = bank balance;
  every bank line is either matched or explicitly held in Suspense.

## Module 5 — Accounting calendars (open / carry forward periods)

**Goal:** run the business across financial years, closing one and carrying balances forward.

- Define a **financial year** and its **periods** (e.g. 12 monthly periods); support a non-
  calendar year start.
- **Open period / closed period:** postings are only allowed into an open period; a closed period
  is locked (consistent with the existing share-lock integrity rule).
- **Year-end carry forward:** close the year, roll income/expense balances into retained
  earnings/owner's equity (the income accounts reset to zero for the new year), and **carry
  forward** asset/liability/equity balances as the new year's opening balances via an opening
  journal.
- **Comparatives:** reports (statement of comprehensive income, statement of financial position)
  can show the prior period/year alongside the current one.
- **Acceptance:** opening balances of a new year equal the closing balances carried forward;
  closed periods reject new postings; a period's trial balance ties to its statements.

## Reports this phase unlocks (renamed per house style)

- **Statement of Comprehensive Income** (today's "profit & loss" view) — now generated from
  income/expense ledger accounts.
- **Statement of Financial Position** (balance sheet) — assets, liabilities and equity at a date,
  which the current single-sided model cannot produce but double-entry does.
- **Trial Balance** — new (Module 2).
- **Cashbook** and **Bank Reconciliation statement** — new (Modules 3–4).

## Non-functional / integrity rules (carried from Phase 1)

- Decimal-safe money (scaled BigInt), never binary floats; half-up rounding.
- Multi-currency preserved: postings keep their original currency; translation stays
  "store-native, translate-late" with the dual effective/official basis and disclosed basis label.
- Tenant isolation, consent-gated sharing, and locked (immutable) records once shared or once a
  period is closed.
- Every automated extraction (bank statement, receipt) is re-validated against the domain and
  owner-confirmed before it posts.

## Suggested build order

1. Module 1 (GL + COA + posting engine + migrate existing captures) — nothing else works without it.
2. Module 2 (trial balance + suspense) — makes correctness visible.
3. Module 5 (accounting calendars) — periods/locking before you accumulate history.
4. Module 3 (cashbook) — a read model over the ledger.
5. Module 4 (bank reconciliation) — builds on the cashbook.

Each module ships test-first (the Phase 1 pattern): pure domain logic in `shared/`, exercised by
unit tests, before any UI or API.
