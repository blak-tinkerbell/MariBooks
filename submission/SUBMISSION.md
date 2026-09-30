# MariBooks — Zero to Shipped Submission

**Hackathon:** Zero to Shipped (AWS Builder Center)
**Window:** September 18 – **October 2, 2026, 11:59 PM PDT** (projects due)
**Category tag:** `#commercial-potential`
**Lane tag:** `#startups`
**Prize context:** 5 winners × ($5,000 AWS credits + ~$600 swag); $28,000 total pool.

> Both tags must be added to the project in Builder Center **before the deadline**.

---

## ⚠️ Ship gate (pass-or-fail — read first)
Shipping live is the whole point. A project that is not live on AWS **does not advance to
judging**. To qualify, the submission MUST include all of:

1. A **coding agent connected to the AWS console, with documented proof** of the connection.
2. A **live application running on AWS, reachable by a public URL** (judges and an AI scoring
   system must be able to reach it).
3. **One app category** (`#commercial-potential`) and **one lane** (`#startups`).
4. An **original application not published before**.
5. A project write-up that shows the **development process, how the coding agent helped you
   ship, the category and lane, and a link to the live app**.

Status:
- **Live public URL:** https://d3vn6ch6zctfj4.cloudfront.net (CloudFront, af-south-1 origin)
- **Coding-agent → AWS connection proof:** [`submission/aws-connection-proof.md`](./aws-connection-proof.md)
  (AWS account 985923204885, af-south-1, verified via `aws sts get-caller-identity`)
- **Repository / project link:** ‹PASTE your public repo URL›
- **Demo login:** create an account in-app (email + password), or use the seeded demo user
  if you have the credentials. Sign-up is self-service via Cognito.

---

## Elevator pitch
MariBooks turns the messy, multi-currency, multi-rail cash flow of African small businesses
into one honest financial record — and a shareable credit passport that unlocks borrowing.
Built and shipped to AWS with an AI coding agent.

## Why this fits Commercial potential
MariBooks is a **vertical SaaS product built for a specific business**: African SMMEs. It
solves the single most time-consuming, error-prone job a small-business owner does every day —
recording money across three currencies (USD, ZiG and ZAR) — often at a street rate that
differs from the official one — and many payment rails (cash, EcoCash, OneMoney, InnBucks,
Zipit, bank, card), then working out whether they made money — and turns those clean records,
plus a declared asset base, into a credit passport that unlocks borrowing. It has a clear market
(millions of under-served SMMEs), a freemium business model (free capture drives adoption;
compliance and lender features monetize), and a defensible data flywheel (the more a business
records, the more valuable its verifiable credit history). That is a real vertical solution
with a path to revenue, not just a tool.

## Why the Startups lane
MariBooks is built to become a product: a clear first user base (Zimbabwean micro-traders and
growing SMEs), a freemium path (free capture drives adoption; compliance and lender features
monetize), and a credit-data flywheel. The submission tells that product story and where it
is headed.

## Inspiration
In a fluctuating economy with little formal banking, owners keep books on scraps of paper, so
they can't tell if they're profitable and have no trusted record to borrow against. MariBooks
fixes capture, gives one honest view of the money, and turns the record into borrowing power.

## What it does
- **Two-tap capture** of money in/out in the currency (USD/ZiG/ZAR) and rail it happened,
  recording fees and IMTT separately from principal, at the **street rate the owner actually
  used** (entered per transaction).
- **Asset tagging:** money-out that buys an asset (equipment, vehicle, tools) is flagged and
  kept out of profit, building a declared asset base for funding applications.
- **Profit in one currency of your choice** (USD, ZiG or ZAR) on your rate basis — effective
  (real economics) or official (statutory) — with no re-keying.
- **Lender-ready statement** (totals, by-category, by-rail, assets acquired) exportable/
  shareable, rate basis disclosed.
- **Credit passport** — verified turnover, cash-flow stability, continuous-record length —
  shared only with explicit, revocable consent.
- **Reliable capture** on low-bandwidth (2G/3G) connections: saves are confirmed, retried on
  transient failure, and never silently dropped.

## How the coding agent helped me ship (development process)
I used a spec-driven workflow with an AI coding agent connected to my AWS console. The
process, which the submission demonstrates:
1. **Problem → requirements:** the agent drafted EARS-format requirements from the problem
   statement — see [`.kiro/specs/maribooks-mvp/requirements.md`](../.kiro/specs/maribooks-mvp/requirements.md).
2. **Design:** architecture, component interfaces, data model, and a requirement→component
   traceability table — see [`.kiro/specs/maribooks-mvp/design.md`](../.kiro/specs/maribooks-mvp/design.md).
3. **Tasks → code:** an incremental, test-backed plan the agent executed task by task — see
   [`.kiro/specs/maribooks-mvp/tasks.md`](../.kiro/specs/maribooks-mvp/tasks.md).
4. **Ship to AWS:** the agent provisioned and deployed the app to AWS and produced the
   connection proof captured in the checklist.

*(‹PERSONALIZE› with 2–3 concrete moments where the agent saved time or caught an issue —
this maps to the "communication quality" and "technical innovation" judging axes.)*

## Architecture & AWS usage
React web app + a security-hardened serverless AWS backend. Full detail in
[`.kiro/specs/maribooks-mvp/infrastructure.md`](../.kiro/specs/maribooks-mvp/infrastructure.md).
- **App:** React SPA calling an authenticated API; reliable capture with retry and idempotent
  writes (client-generated IDs) so retries never duplicate.
- **Core services:** multi-currency ledger (USD/ZiG/ZAR), dual-basis FX engine (owner-entered
  effective rate + official reference table), payment-rail engine (fees + IMTT), asset register,
  reporting, credit passport.
- **AWS:** CloudFront + private S3 (SPA public URL, OAC only), AWS WAF, API Gateway HTTP API
  with a Cognito JWT authorizer, Lambda (Node 22), DynamoDB (single-table, PITR), KMS
  (customer-managed keys), SSM Parameter Store, CloudWatch + CloudTrail + X-Ray.
- **Security posture (financial data):** TLS 1.2+ everywhere; encryption at rest with
  customer-managed KMS keys; no anonymous access to data (Cognito JWT on every route);
  per-tenant isolation from the JWT claim; least-privilege IAM; no secrets in code (SSM +
  OIDC deploy role); immutable CloudTrail audit trail.
- **Public URL surface:** the CloudFront distribution URL (stack output `CloudFrontUrl`) is the
  live app judges and the AI scoring system reach.

## Judging axes — how this submission addresses them
- **Creativity & storytelling:** the "one dataset, three beneficiaries" (owner, lender, ZIMRA)
  narrative and the credit-passport hook.
- **Technical innovation:** store-native/translate-late multi-currency ledger (USD/ZiG/ZAR)
  with honest fee/IMTT modelling and a **dual rate basis** — the owner's real street rate vs
  the official rate — which is the genuinely hard, locally-specific problem in this market.
- **Community & market impact:** a large, underserved SMME base; a credit on-ramp for the
  financially excluded.
- **Communication quality:** clear spec artifacts, a tight live demo, and documented
  agent-assisted process.

## Suggested live-demo path (for judges / AI reachability)
Open **https://d3vn6ch6zctfj4.cloudfront.net** and create an account, then:
1. Capture a USD EcoCash sale and a ZiG cash expense (two taps each), add a fee/IMTT, and a
ZAR purchase entering the street rate. 2. Flag a money-out as an asset (e.g. a fridge).
3. Toggle dashboard currency (USD/ZiG/ZAR) and rate basis (effective/official). 4. Export a
lender-ready statement. 5. Generate and share the credit passport (with the asset base) with
consent.

## What's next
Full offline-first capture with background sync (a core principle of the wider product),
fiscal invoicing + ZIMRA FDMS, a full tax rules engine, AI receipt capture, USSD/WhatsApp
channels, and a lender console fed by consented data.

## Team & eligibility
- **Team / builder:** ‹CONFIRM names + Builder Center profile›
- **18 or older:** ‹CONFIRM›
- **Country / employee exclusions:** ‹CONFIRM against the Rules tab — do not assume eligible›
- **Original & not previously published:** ‹CONFIRM›

## Attribution
Product concept source: `MariBooks_Product_Concept.docx` (Ushauri Consulting).
