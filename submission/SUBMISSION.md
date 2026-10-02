# MariBooks — know if you're making money, in any currency

**Live app:** https://d3vn6ch6zctfj4.cloudfront.net
**Try it with no sign-up:** https://d3vn6ch6zctfj4.cloudfront.net/?demo — a demo business with six months of records
**Code:** https://github.com/blak-tinkerbell/MariBooks
**Category:** `#commercial-potential` · **Lane:** `#startups`
**Built with:** an AI coding agent connected to AWS ([proof](./aws-connection-proof.md)), deployed to AWS af-south-1 (Cape Town)

> *Mari* is Shona for money.

![Dashboard](./screenshots/01-dashboard.png)

---

## The problem (the story)

Meet Tryphine. She runs **TS Haute Couture**, a boutique selling clothing and accessories from
**two branches** in Harare. She buys stock in US dollars on sourcing trips to **China and
Turkey** — paying by bank transfer that carries 2% IMTT, plus flights, hotels and transport on
each trip. In the shop she is paid in USD cash, by card, on EcoCash and InnBucks, and sometimes
in rand by a cross-border customer. Some of her best clients buy on account through the month and
**settle at month-end**. She renovates the stores and buys display mannequins. At the end of the
month she has a notebook full of numbers in three currencies at different rates, and she still
cannot answer one question: **am I making money?**

Because her records are scattered across currencies, wallets and two tills, a lender cannot see a
trading history — so she cannot borrow to open the third branch, even though the business is
clearly growing.

MariBooks answers that question in one screen and turns the same records into a **credit passport** she can share with a lender and take back when she chooses.

## What it does

| | |
|---|---|
| **Record money in seconds** | Money in / out, in USD, ZiG or ZAR, on cash, EcoCash, OneMoney, InnBucks, Zipit, bank or card. Every amount stays in the currency it happened in. |
| **Paste the SMS instead of typing** | Paste an EcoCash, InnBucks or bank confirmation SMS and the form fills itself: amount, currency, direction, rail, fee, IMTT, reference, date. It never reads the running balance as the amount. |
| **Snap the invoice or receipt** | Attach an invoice or receipt to any entry. **Amazon Textract** reads the total, date and vendor and fills the form; the owner confirms before saving. The file is proof a lender can open — a passport entry backed by a receipt is verifiable, not just claimed. |
| **Fees and IMTT as percentages** | Enter "2%" and MariBooks works out the charge and keeps it separate from the principal, so profit is honest. |
| **The rate you actually got** | For ZiG and ZAR the owner enters the **market rate** they traded at. A separate **official** rate table drives statutory-style reports. Every figure shows which basis it uses. |
| **"Are you making money?"** | Dashboard: profit for the period with the change on the previous one, money in, operating costs, asset spend, fees & IMTT, six-month profit trend, cash by payment method, recent activity. Switch the view between USD / ZiG / ZAR and market / official in one tap. |
| **Capital expenditure (APEX) kept out of profit** | Buying a store fit-out or display mannequins doesn't wreck a month's profit. It's tagged as capital expenditure (APEX) and builds the declared capital base. |
| **Lender-ready statement** | Statement of Comprehensive Income for any period: money in, operating costs by category, net profit and margin, capital expenditure below the line, rate basis and currency mix disclosed. Download as PDF. |
| **Credit passport, with consent** | Average monthly turnover, cash-flow stability, continuous-record length, declared assets, and a 4-point readiness check. Shared only after explicit consent, revocable at any time. Entries in an active share are locked, so a lender always sees exactly what was sent. |
| **Works on bad connections** | If a save fails because the connection dropped, the entry is kept on the device and synced when the connection returns — idempotent ids mean it is never duplicated. The app shell loads offline. |
| **Every field validated** | Amounts (positive, 2 decimals), percentages (0–100, with a warning above 20%), rates, dates (not in the future), asset details, notes (80 chars), passwords matching the account policy — with plain-language messages next to the field. |

## Creativity & storytelling

- **One question, answered first.** The landing screen is literally "Are you making money?" with a yes/no sentence, not a ledger.
- **Built for how money moves in Zimbabwe:** three currencies, seven payment rails, IMTT, a market rate that differs from the official one. These aren't edge cases here; they're every day.
- **The design carries the place.** The chevron pattern throughout the app comes from the walls of Great Zimbabwe; deep teal and marigold are the palette.
- **One record, three beneficiaries:** the owner sees profit, the lender sees a trustworthy history, and the same data can later feed tax compliance.

## Technical innovation

1. **Store-native, translate-late ledger.** Amounts are stored in their original currency as decimal strings and converted only when a report is built. Money maths uses scaled BigInt — never binary floats — with half-up rounding.
2. **Dual rate basis.** Each foreign-currency entry carries the owner's effective (street) rate; reports can instead use a dated official rate table (most-recent-on-or-before lookup, inverse pairs handled). The basis label travels with every figure.
3. **Honest fees.** Rail fees and IMTT are stored separately from principal and counted as operating costs on both money in and money out. (The agent's end-to-end test caught that fees on money *received* were being dropped from profit; it's fixed and covered by a test.)
4. **Payment-SMS parser.** A deterministic parser in the shared domain package reads amount, currency (incl. ZWG → ZiG), direction, rail, fee, IMTT, counterparty, reference and date, strips running balances first, and reports its own confidence. It runs in the browser with no network. On the server, `POST /parse` can hand low-confidence messages to **Amazon Bedrock** (optional, one CloudFormation parameter); the model's output is re-validated against the domain enums before use, and rule-extracted fields always win.
8. **Proof-of-transaction uploads with Textract.** Invoices and receipts are uploaded straight from the browser to a private S3 bucket via short-lived presigned URLs — the file never passes through Lambda. **Amazon Textract** (`AnalyzeExpense`) reads the total, date and vendor; like the SMS path, its output is re-validated against the domain before it prefills the form, and the owner confirms before saving. Every object key is forced under the owner's tenant prefix, so a presigned URL can only ever touch that owner's own files. The bucket is private (no public access), KMS-encrypted, versioned, and CORS-locked to the app origin. The Textract region is configurable because the service and the bucket must share a region (Textract isn't offered in af-south-1); scanning degrades gracefully to manual entry if unavailable, and the proof file is still stored either way.
5. **Consent-gated, lockable sharing.** A share can only be created with an explicit consent flag (enforced in the domain *and* the API). Transactions in an active share are locked against edit/delete server-side (HTTP 409), so a shared passport can't be quietly changed.
6. **Offline-tolerant capture.** Client-generated UUIDs are idempotency keys, so the outbox can resend safely; the API's PutItem on PK+SK makes retries produce exactly one record.
7. **Security for financial data:** Cognito JWT on every route, tenant id only from the token claim, customer-managed KMS encryption, PITR, least-privilege IAM, locked CORS, WAF, CloudTrail with log-file validation, alarms to SNS.

![Architecture](./architecture.png)

**Tests:** 44 domain unit tests (money, FX, ledger, reporting, passport, assets, SMS parser, fees on money in, proof attachments) + 4 API integration tests (idempotent retries, recoverable failed saves, SMS parse route) — 48 in total, all passing.

## Community & market impact

- **Who it's for:** micro and small businesses in Zimbabwe — boutiques, tuck shops, market traders, salons, hardware, cross-border traders — who deal in USD, ZiG and ZAR at once.
- **Why it matters:** the [FinScope MSME Survey Zimbabwe 2022](https://finmark.org.za/Publications/FinScope_MSME_Survey_Zimbabwe2022_Pocket_Guide.pdf) counted roughly **1.6 million** business owners employing about **1.7 million** people ([UN/ZimStat summary of the 2022 findings](https://sdgs.un.org/sites/default/files/2024-11/Session%208%20C%20Mukosera%20MSMEs%20Presentation%20UN..pdf)), and MSMEs contribute **over 50% of GDP** ([AFI, 2022](https://issuu.com/afi-global/docs/increasing_women_s_financial_inclus_805f4fac673d9b/6)). Yet lending barely reaches them: **MSME loans are only about 5.54% of total bank loans** ([AFI, 2022](https://issuu.com/afi-global/docs/increasing_women_s_financial_inclus_805f4fac673d9b/6)). The missing piece between a growing business and a loan is a trustworthy trading record — exactly what MariBooks produces. *(Figures summarised from the cited sources; content rephrased for licensing compliance.)*
- **Early users:** ‹ADD what happened when real owners used it — how many people, how many entries, one direct quote with permission. Even three people over two days is evidence. If you have none yet, delete this line rather than invent numbers.›
- **What changes for an owner:** they can see profit at the rate they actually got, see how much fees and IMTT cost them, and hand a lender a statement and passport instead of a notebook.

## Where it's headed (Startups lane)

- **Business model:** free for owners to record and see profit; lenders and microfinance institutions pay for verified, consented passports and statements; premium tax-ready reports for growing SMEs.
- **Next:** a full double-entry accounting phase — general ledger and chart of accounts, trial balance with a self-balancing suspense account, cashbook, bank reconciliation, and open/carry-forward accounting calendars, producing a Statement of Comprehensive Income and a Statement of Financial Position. Scoped in [`.kiro/specs/maribooks-accounting/`](../.kiro/specs/maribooks-accounting/README.md). Plus a lender view through the share link, WhatsApp and USSD capture for feature phones, ZIMRA fiscal-invoice integration, and more languages (Shona and Ndebele).
- **Flywheel:** the more an owner records, the stronger their passport, the more reason to keep recording.

## How the coding agent helped me ship

The project was built spec-first with an AI coding agent connected to the AWS account ([connection proof](./aws-connection-proof.md)). The specs it drafted and then executed are in [`.kiro/specs/maribooks-mvp/`](../.kiro/specs/maribooks-mvp/): [requirements](../.kiro/specs/maribooks-mvp/requirements.md) → [design](../.kiro/specs/maribooks-mvp/design.md) → [tasks](../.kiro/specs/maribooks-mvp/tasks.md).

Concrete moments:
- **Infrastructure:** provisioned four CloudFormation/SAM stacks (core API, hosting, WAF in us-east-1, audit) and verified them live — JWT enforcement (401), CORS locked to the app origin, WAF attached, CloudTrail logging ([DEPLOYED.md](../infra/DEPLOYED.md)).
- **Redesign from screenshots:** turned a cramped phone-width prototype into a full web app — first as a clickable design, then implemented in React — with a sidebar on desktop, a bottom bar on phones, the dashboard as the landing page, and field-level validation everywhere.
- **Bugs caught by testing, not by users:** an end-to-end browser test showed that a fee on money *received* didn't reduce profit; the agent fixed the shared reporting engine and added a regression test. It also found the API build had been failing on a missing type package, and that the demo data skipped rent when the 1st fell on a Sunday.
- **Judge-friendly by design:** the agent added the no-sign-up demo so anyone reaching the URL sees a working business immediately, then rebuilt that demo as a real boutique (TS Haute Couture — two branches, imports from China and Turkey, month-end account clients, renovation and mannequin assets) and verified the generated six months of data against the live reporting engine before deploying.
- ‹PERSONALISE: add one moment in your own words — something the agent did that surprised you or saved you a day.›

## Try it (60 seconds)

> For a guided, step-by-step tour mapped to the judging axes, see
> [**JUDGE_WALKTHROUGH.md**](./JUDGE_WALKTHROUGH.md). It uses the pre-loaded demo business
> (*TS Haute Couture*, a two-branch boutique) so every screen has data to show.

1. Open **https://d3vn6ch6zctfj4.cloudfront.net/?demo**.
2. **Dashboard:** switch USD → ZiG → ZAR and Market rate → Official. Every figure recalculates and says which basis it uses.
3. **Record money:** paste `You paid USD 2,100.00 to Istanbul Textiles on 12/09/2026. Charge: USD 10.00 IMTT: USD 42.00 Ref TR8842` into "Paste a payment SMS" → **Fill the form** (a boutique stock import). Try an amount like `12.345` or a fee of `150` to see validation.
4. **Attach a receipt:** in a signed-in account, open **Record money → Attach an invoice or receipt**, upload a photo or PDF, and watch Amazon Textract fill the total and date. In the demo, some entries already have a sample invoice/receipt — see them under **Statement → Proof of transactions**.
5. **Statement:** pick a period → **Download PDF**.
6. **Credit passport:** share with a lender (consent required), then revoke it.

## Screenshots

| | |
|---|---|
| ![Record from SMS](./screenshots/02-record-from-sms.png) | ![Validation](./screenshots/03-validation.png) |
| ![Statement](./screenshots/04-statement.png) | ![Credit passport](./screenshots/05-credit-passport.png) |
| ![Sign in with demo](./screenshots/07-sign-in-with-demo.png) | ![Phone](./screenshots/08-phone-dashboard.png) |

## Team & eligibility
- **Builder:** ‹YOUR NAME + link to your Builder Center profile›
- **18 or older, eligible country, not an excluded employee:** ‹state "Confirmed" once checked against the Rules tab›
- **Original, not previously published:** ‹state "Confirmed"›

*Product concept: `MariBooks_Product_Concept.docx` (Ushauri Consulting).*
