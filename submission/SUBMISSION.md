# MariBooks — know if you're making money, in any currency

> **In one line:** MariBooks lets a Zimbabwean small-business owner record money in USD, ZiG or ZAR in seconds, see in one screen whether she is making money, and turn that record into a statement and credit passport a lender can trust.

**Live app:** https://d3vn6ch6zctfj4.cloudfront.net
**Try it with no sign-up:** https://d3vn6ch6zctfj4.cloudfront.net/?demo (a two-branch boutique with six months of records)
**Code:** https://github.com/blak-tinkerbell/MariBooks
**Category:** #commercial-potential · **Lane:** #startups
**Built with:** Claude (design) and Kiro (spec-driven build and agentic deployment), connected to AWS · **Region:** af-south-1 (Cape Town)

*Mari* is Shona for money.

![MariBooks dashboard](https://raw.githubusercontent.com/blak-tinkerbell/MariBooks/main/submission/screenshots/01-dashboard.png)

## The problem: a growing business that can't prove it

Tryphine runs TS Haute Couture, a clothing boutique with two branches in Harare. She buys stock in US dollars on sourcing trips to China and Turkey, paying by bank transfer that carries 2% IMTT. In the shop she is paid in USD cash, by card, on EcoCash and InnBucks, and sometimes in rand. Account clients settle at month-end. She fits out stores and buys mannequins.

At month-end she has a notebook of numbers in three currencies at different rates, and she still can't answer one question: **am I making money?**

Because her records are scattered across currencies, wallets and two tills, a lender can't see a trading history either. She can't borrow to open a third branch, even though the business is growing.

Tryphine is not an edge case. Since ZiG replaced the ZWL in April 2024, Zimbabwean businesses routinely trade in two or three currencies at once, at a market rate that differs from the official one. Generic bookkeeping tools assume one currency and one bank account. MariBooks is designed around how money actually moves here.

## Why it matters

- The [FinScope MSME Survey Zimbabwe 2022](https://finmark.org.za/Publications/FinScope_MSME_Survey_Zimbabwe2022_Pocket_Guide.pdf) counted roughly **1.6 million** business owners employing about **1.7 million** people.
- MSMEs contribute over half of GDP, yet MSME loans make up only about **5.5%** of total bank lending ([AFI, 2022](https://issuu.com/afi-global/docs/increasing_women_s_financial_inclus_805f4fac673d9b/6)).
- The gap between a growing business and a loan is a trustworthy trading record. That record is exactly what MariBooks produces, as a by-product of the owner simply tracking her money.

## What MariBooks does

| | |
|---|---|
| **Record money in seconds** | Money in/out in USD, ZiG or ZAR, across cash, EcoCash, OneMoney, InnBucks, Zipit, bank or card. Every amount stays in the currency it happened in. |
| **Paste the SMS instead of typing** | Paste an EcoCash, InnBucks or bank confirmation and the form fills itself: amount, currency, direction, rail, fee, IMTT, reference and date. The running balance is never mistaken for the amount. |
| **Attach proof** | Upload an invoice or receipt to any entry. It is stored in a private, encrypted bucket as evidence a lender can open. Phase 2 adds Amazon Textract to read the total, date and vendor and prefill the form. |
| **Honest fees and IMTT** | Enter "2%" and MariBooks computes the charge and keeps it separate from principal. |
| **The rate you actually got** | For ZiG and ZAR the owner records the market rate she traded at. A separate official rate table drives statutory-style reports. Every figure shows its rate basis. |
| **"Are you making money?"** | The dashboard answers with a yes/no sentence, then shows profit vs. the prior period, money in, operating costs, capital expenditure, fees and IMTT, a six-month trend and cash by payment method. One tap switches USD/ZiG/ZAR and market/official. |
| **Capital expenditure kept out of profit** | A store fit-out doesn't wreck a month's profit. It is tagged as capital expenditure and builds a declared capital base. |
| **Lender-ready statement** | Statement of Comprehensive Income for any period, with capital expenditure below the line and rate basis and currency mix disclosed. Downloadable as PDF. |
| **Credit passport, with consent** | Average monthly turnover, cash-flow stability, record length, declared assets and a four-point readiness check. Shared only with explicit, revocable consent; entries in an active share are locked so a lender sees exactly what was sent. |
| **Works on bad connections** | Failed saves queue on the device and sync later without duplicates. The app shell loads offline. |

![Record from SMS](https://raw.githubusercontent.com/blak-tinkerbell/MariBooks/main/submission/screenshots/02-record-from-sms.png)

![Credit passport](https://raw.githubusercontent.com/blak-tinkerbell/MariBooks/main/submission/screenshots/05-credit-passport.png)

## Architecture

![Architecture](https://raw.githubusercontent.com/blak-tinkerbell/MariBooks/main/submission/architecture.png)

Four CloudFormation/SAM stacks, all deployed and verified live:

- **Core (af-south-1):** API Gateway HTTP API with a Cognito JWT authorizer → Lambda (Node.js 22, arm64, X-Ray) → DynamoDB on-demand (customer-managed KMS, PITR, deletion protection). A private, KMS-encrypted, versioned S3 bucket holds proof files. SSM Parameter Store holds config.
- **Hosting (af-south-1):** CloudFront with Origin Access Control to a private S3 bucket, HTTPS-only, HSTS and security headers.
- **WAF (us-east-1):** AWS managed Common and Known Bad Inputs rule sets plus an IP rate limit.
- **Audit (af-south-1):** multi-region CloudTrail with log-file validation, and CloudWatch alarms on Lambda errors and API 5xx to SNS.

**Why this shape:** the data is financial, so security is built in from the first deploy rather than added later. Hosting in Cape Town keeps latency low for Southern African users. Fully serverless, on-demand, arm64 compute means near-zero cost at idle, which matters for a product whose core users will pay nothing.

## Technical innovation

1. **Store-native, translate-late ledger.** Amounts are stored in their original currency as decimal strings and converted only when a report is built. Money maths uses scaled BigInt with half-up rounding, never binary floats.
2. **Dual rate basis.** Each foreign-currency entry carries the owner's effective market rate; reports can instead use a dated official rate table (most-recent-on-or-before lookup, inverse pairs handled). The basis label travels with every figure.
3. **Honest fees.** Rail fees and IMTT are stored separately from principal and counted as operating costs on both money in and money out.
4. **Payment-SMS parser.** A deterministic parser in the shared domain package extracts amount, currency (including ZWG → ZiG), direction, rail, fee, IMTT, counterparty, reference and date, strips running balances first, and reports its own confidence. It runs in the browser with no network. A server route can optionally pass low-confidence messages to Amazon Bedrock; model output is re-validated against domain enums and rule-extracted fields always win.
5. **Direct-to-S3 proof uploads.** Files go from the browser to S3 via short-lived presigned URLs and never pass through Lambda. Every object key is forced under the owner's tenant prefix, so a presigned URL can only touch that owner's files. The Textract `AnalyzeExpense` route and IAM scope are already in the stack for Phase 2; its output will be re-validated against the domain before prefilling the form, with the owner confirming before save.
6. **Consent-gated, lockable sharing.** A share requires an explicit consent flag, enforced in both the domain and the API. Transactions in an active share are locked against edit/delete server-side (HTTP 409).
7. **Offline-tolerant capture.** Client-generated UUIDs act as idempotency keys; PutItem on PK+SK means a retried save produces exactly one record.
8. **Security for financial data.** Cognito JWT on every data route, tenant ID taken only from the token's `sub` claim, least-privilege IAM scoped to one table, one key, one parameter and one bucket, CORS locked to the app origin.

**Tests:** 48 passing (44 domain unit tests covering money, FX, ledger, reporting, passport, assets, SMS parsing and proof attachments, plus 4 API integration tests covering idempotent retries, recoverable failed saves and the SMS route).

## How the coding agents helped me ship

MariBooks was built with two agents, each doing what it does best:

- **Claude** for product design: it turned a cramped phone-width prototype into wireframes and a clickable design, settling the information architecture (dashboard as landing page, sidebar on desktop, bottom bar on phones) before any production code was written.
- **Kiro** for spec-driven development and agentic deployment: it turned the concept and designs into requirements, design and task specs, built against them task by task, and deployed and verified the AWS stacks through a session authenticated to my AWS account via IAM Identity Center (SSO).

**Connection proof** (captured 2026-09-30, af-south-1):

```
$ aws sts get-caller-identity --profile MariBooks
{
    "UserId": "####################:tari",
    "Account": "############",
    "Arn": "arn:aws:sts::############:assumed-role/AWSReservedSSO_<permission-set>/tari"
}
```

**Kiro working against the live AWS account** (screenshots from the build session):

![Kiro connected to AWS: identity check, stack deployment, S3 sync, CloudFront invalidation and live verification](https://raw.githubusercontent.com/blak-tinkerbell/MariBooks/main/submission/screenshots/10-kiro-aws-connection-proof.png)

*What the panels show:* Kiro confirming the SSO identity with `sts get-caller-identity` (account ID redacted, region af-south-1) and recording it as the connection proof; validating and deploying the hosting CloudFormation stack and reading stack events to diagnose a failed changeset; syncing the built SPA to S3 and invalidating CloudFront until complete; and verifying the live app from the terminal (app root, current bundle, service worker and manifest all HTTP 200, unauthenticated API call HTTP 401).

Kiro drafted the specs and then executed them: [requirements](https://github.com/blak-tinkerbell/MariBooks/blob/main/.kiro/specs/maribooks-mvp/requirements.md) → [design](https://github.com/blak-tinkerbell/MariBooks/blob/main/.kiro/specs/maribooks-mvp/design.md) → [infrastructure](https://github.com/blak-tinkerbell/MariBooks/blob/main/.kiro/specs/maribooks-mvp/infrastructure.md) → [tasks](https://github.com/blak-tinkerbell/MariBooks/blob/main/.kiro/specs/maribooks-mvp/tasks.md).

Concrete moments:

- **Agentic deployment.** Kiro provisioned the four stacks and verified them live: unauthenticated API calls return 401, a disallowed origin gets no CORS header, the WAF WebACL is attached to CloudFront, and CloudTrail is logging. The full record is in [DEPLOYED.md](https://github.com/blak-tinkerbell/MariBooks/blob/main/infra/DEPLOYED.md).
- **Design to build.** Claude's wireframes became the build reference; Kiro implemented them in React with field-level validation throughout, so the shipped app matches the design rather than drifting from it.
- **Bugs caught by testing, not by users.** An end-to-end browser test showed that a fee on money *received* didn't reduce profit. Kiro fixed the shared reporting engine and added a regression test. It also found that the API build was failing on a missing type package, and that demo data skipped rent whenever the 1st fell on a Sunday.
- **Self-diagnosis.** When the hosting stack's changeset failed an early validation check, Kiro pulled the CloudFormation stack events itself to find the cause rather than retrying blind.
- **Judge-friendly by design.** Kiro added the no-sign-up demo, rebuilt it as a realistic two-branch boutique, and checked the generated six months of data against the live reporting engine before deploying.
- **Regional constraints.** While scoping receipt scanning, Kiro verified against AWS documentation that Textract isn't offered in af-south-1 and that `AnalyzeExpense` requires the bucket and call in the same region. Rather than ship a half-working feature, we kept proof storage in Cape Town for launch and made the Textract region a stack parameter for Phase 2.

**What I'd tell another builder:** split the work by agent strength. Designing first in Claude and then handing Kiro a spec meant the agent was executing a plan rather than guessing one, which is why a multi-currency financial app with four production stacks shipped in two weeks.

## Development process

| Date | Milestone |
|---|---|
| Sep 18 – 30 | Product concept → Claude wireframes → Kiro requirements, design, infrastructure and task specs; domain package (money, FX, ledger, reporting, passport) built test-first |
| Sep 30 – Oct 1 | First deployment of all four stacks to af-south-1; redesign, demo mode, SMS capture and offline outbox merged |
| Oct 2 | Boutique demo and judge walkthrough; proof-of-transaction uploads; Phase 2 (double-entry and Textract) specified |

## Try it in 60 seconds

1. Open https://d3vn6ch6zctfj4.cloudfront.net/?demo in a private window.
2. **Dashboard:** switch USD → ZiG → ZAR and Market → Official. Every figure recalculates and labels its basis.
3. **Record money:** paste `You paid USD 2,100.00 to Istanbul Textiles on 12/09/2026. Charge: USD 10.00 IMTT: USD 42.00 Ref TR8842` into "Paste a payment SMS" and click **Fill the form**. Try an amount of `12.345` to see validation.
4. **Statement:** pick a period and download the PDF. Demo entries with attached invoices appear under **Proof of transactions**.
5. **Credit passport:** share with a lender (consent required), then revoke.

A full guided tour mapped to the judging criteria is in [JUDGE_WALKTHROUGH.md](https://github.com/blak-tinkerbell/MariBooks/blob/main/submission/JUDGE_WALKTHROUGH.md).

## Where it's headed (Startups lane)

- **Business model:** free for owners to record and see profit. Lenders and microfinance institutions pay for verified, consented passports and statements. Growing SMEs pay for tax-ready reports. The owner never pays for the thing that makes her bankable.
- **Route to market:** The product has a direct route to the lender side of the marketplace, the side that pays. 
- **Phase 2:** Amazon Textract receipt and invoice scanning, so a photo of a slip becomes a prefilled entry backed by verifiable proof. Alongside it, a full double-entry layer with general ledger, chart of accounts, trial balance with suspense account, cashbook, bank reconciliation and period close, producing a Statement of Financial Position alongside the income statement ([spec](https://github.com/blak-tinkerbell/MariBooks/blob/main/.kiro/specs/maribooks-accounting/README.md)).
- **After that:** a lender view through the share link, WhatsApp and USSD capture for feature phones, ZIMRA fiscal-invoice integration
- **Flywheel:** the more an owner records, the stronger her passport, and the more reason to keep recording.


