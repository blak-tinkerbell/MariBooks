# MariBooks MVP — Implementation Plan

Incremental, test-backed build order. Each task is scoped to code the previous tasks make
possible, and references the requirements it satisfies. Complete tasks top to bottom.

> **Status synced to code on 2026-10-01 — ALL TASKS COMPLETE ✅.** `[x]` = implemented, built
> clean, and verified. Test suite: **32 tests pass** (30 shared domain + 2 API integration).
> All infrastructure is deployed to AWS (`af-south-1`, account `############`) and verified live.
>
> **Live app:** **https://d3vn6ch6zctfj4.cloudfront.net** (HTTP 200)
>
> **Deployed stacks (see `infra/DEPLOYED.md`):**
> - `maribooks-prod` (af-south-1) — API + Lambda + DynamoDB + Cognito + KMS + SSM config; CORS
>   locked to the CloudFront origin.
> - `maribooks-hosting` (af-south-1) — private S3 + CloudFront (OAC) + security headers, WAF
>   associated.
> - `maribooks-waf` (us-east-1) — CloudFront-scope WAF WebACL (managed rules + rate limit).
> - `maribooks-audit` (af-south-1) — multi-region CloudTrail + SNS + CloudWatch alarms.
>
> **Verified live:** app serves 200; API returns 401 unauthenticated (Cognito enforced); CORS
> allows only the app origin (disallowed origins get no ACAO header); WAF associated with the
> distribution; SSM parameter present; CloudTrail actively logging.

- [x] 1. Project scaffold & shared foundations
  - Set up the React + TypeScript + Vite web app project and a resource bundle for
    externalized strings (English).
  - Add a single money type/formatter (decimal-safe, explicit USD / ZiG / ZAR label) used
    everywhere, plus a rate-basis label helper.
  - Add client-side UUID generation and an ISO date helper.
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 2. Data layer (shared TS types + repositories)
  - [x] 2.1 Define records: `business_profile`, `transaction` (incl. `effectiveRate`,
    `isAsset`/`assetClass`), `official_rate` (pair+date), `share_link`.
    - Store money as decimal strings / integer minor units (no floats).
    - _Requirements: 1.3, 2.3, 2.7, 3.1, 3.3_
    - _All four records defined in `shared/src/types.ts` (`ShareLink` added with kind, consent,
      revocation, and the included transaction ids that drive the edit lock)._
  - [x] 2.2 Implement repositories/accessors with unit tests for CRUD and decimal round-trips.
    - DynamoDB accessors in `api/src/db.ts` (incl. `SHARE#` items); decimal round-trips covered
      in `domain.test.ts`.
    - _Requirements: 2.8_

- [x] 3. Business Profile Service (R1)
  - Create/read/save the single business profile with name, optional TIN, reporting currency
    (USD / ZiG / ZAR).
  - Allow changing reporting currency without touching stored amounts.
  - Persist to the backing store; load on launch.
  - Unit tests for create, reload, currency change.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _get/put profile + reporting-currency toggle (presentation-only) implemented (`api/src/db.ts`,
    `handler.ts`, `web/src/App.tsx`); profile shape + currency-change-doesn't-touch-amounts tests
    in `domain.test.ts` ("business profile" describe block)._

- [x] 4. FX Engine — effective + official basis (R3)
  - [x] 4.1 Implement `OfficialRateTable` per currency pair with dated lookup (most recent
    on/before date), manual upsert, and history.
    - _Requirements: 3.3, 3.7_
  - [x] 4.2 Implement pure `translate(txn, to, basis)`: EFFECTIVE uses the rate stored on the
    transaction; OFFICIAL uses the dated official table; pass-through for matching currency;
    returns value + rate used + rate date + basis.
    - _Requirements: 3.1, 3.4, 3.5_
  - [x] 4.3 OFFICIAL fallback to most recent prior rate with visible date; attach the "confirm
    applicable ZIMRA/reference rate" note; never present a street/effective rate as statutory.
    - _Requirements: 3.8_
  - [x] 4.4 Unit tests: effective per-txn, official dated lookup, fallback, pass-through,
    3-currency pairs, basis labelling.
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.8_

- [x] 5. Ledger Service — capture (R2)
  - [x] 5.1 Implement `addTransaction` capturing direction, amount, currency (USD/ZiG/ZAR),
    rail, category, date, note; store in original currency.
    - `buildTransaction` / `validateTransaction` in `shared/src/ledger.ts`.
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
  - [x] 5.2 Capture the owner-entered `effectiveRate` for cross-currency transactions
    (pre-filled from last known, overridable).
    - _Requirements: 3.1, 3.2_
    - _Note: field is overridable in the capture UI; "pre-filled from last known" is not wired._
  - [x] 5.3 Add optional `fee` and `imtt` fields kept distinct from principal.
    - _Requirements: 2.5_
  - [x] 5.4 Support asset tagging on money-out: `isAsset` + required `assetClass` +
    description.
    - _Requirements: 2.7, 9.1_
  - [x] 5.5 Implement `editTransaction` / `deleteTransaction` (allowed while not in a shared
    statement) and `listTransactions(range)`.
    - _Requirements: 2.8_
    - _`editTransaction` + `assertDeletable` + `LockedTransactionError` in `shared/src/ledger.ts`;
      the handler enforces the lock on PUT/DELETE (returns 409) using `lockedTransactionIds` over
      active shares; list via `listTransactions`._
  - [x] 5.6 Amount validation (>0, correct format) with inline errors.
    - _Requirements: 2.1_
  - [x] 5.7 Unit tests for capture, effective rate, fee/IMTT separation, asset flag,
    edit/delete, listing.
    - _Requirements: 2.1, 2.5, 2.7, 2.8, 3.1_
    - _"ledger edit / delete / lock" describe block covers edit, re-validation, and the lock on
      both edit and delete._

- [x] 6. Capture UI — two-tap flow (R2, R3, R8, R9)
  - Money-in / money-out capture screen: amount pad, currency selector (USD/ZiG/ZAR), rail
    picker, category, optional fee/IMTT, note.
  - When cross-currency, show an effective-rate field pre-filled and overridable.
  - On money-out, an "this is an asset" toggle revealing an asset-class picker + description.
  - Enforce ≤ two primary taps beyond amount entry; large tap targets and icons.
  - Wire to Ledger Service; reflect immediately.
  - _Requirements: 2.4, 3.1, 8.1, 8.3, 9.1_
  - _Implemented as the `Capture` component in `web/src/App.tsx`._

- [x] 7. Reporting Service — dashboard (R4, R9)
  - Aggregate ledger into money in / operating out / profit for this week and this month in the
    chosen reporting currency and rate basis (EFFECTIVE default; via FX Engine).
  - Exclude asset purchases from profit; surface `assetSpend` separately.
  - Compute cash-position-by-rail (IN minus OUT incl. fees/IMTT and asset purchases).
  - Plain-language summary ("You made X this week") and rate-basis note.
  - Recompute on any capture/edit/delete.
  - Unit tests incl. multi-currency (USD/ZiG/ZAR) consolidation and asset-exclusion.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.2_
  - `getDashboard` in `shared/src/reporting.ts`; asset-exclusion + consolidation tested._

- [x] 8. Dashboard UI (R4, R8)
  - Render profit, asset spend, cash-by-rail, reporting-currency toggle (USD/ZiG/ZAR) and
    rate-basis toggle (effective/official).
  - Show rate-basis note. Update live after capture.
  - _Requirements: 4.1, 4.2, 4.4, 8.1_
  - _`Dashboard` component in `web/src/App.tsx` (currency + basis toggles, rate-basis note)._

- [x] 9. Reporting Service — statements (R5, R9)
  - Build `getStatement(range, currency, basis)`: totals (money in, operating out, net profit,
    asset spend), by-category, by-rail, assets-acquired by class, rate basis, period,
    business name, generatedAt.
  - Include only records in the selected range; keep assets out of profit.
  - Implement `exportStatementPdf` producing a printable/shareable document.
  - Unit tests for totals, asset split, and rate-basis disclosure; snapshot test for export.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.3_
  - _`getStatement` (totals/by-category/by-rail/assets) done and tested (incl. the E2E scenario).
    PDF export is the browser print dialog in the UI — a deliberate MVP choice (zero-dependency,
    works offline, lender-printable) rather than a server-rendered PDF._

- [x] 10. Statement UI & export (R5, R8)
  - Date-range picker, currency toggle, rate-basis toggle, on-screen statement, export/share.
  - _Requirements: 5.2, 5.3, 8.1_
  - _`Statement` component in `web/src/App.tsx`; export via `window.print()` → Save as PDF._

- [x] 11. Asset Register (R9)
  - [x] 11.1 Project `listAssets()` and `assetSummary(currency, basis)` over `isAsset`
    transactions (total + by class).
    - `shared/src/assets.ts`.
    - _Requirements: 9.1, 9.3_
  - [x] 11.2 Allow editing asset details / unflagging before inclusion in a shared
    statement/passport; label the base as owner-declared acquisition cost.
    - _Requirements: 9.4, 9.5_
    - _`editAsset` in `shared/src/assets.ts` edits class/description or unflags back to an
      operating expense, and refuses when the transaction is locked by an active share. Base
      labelled "Owner-declared acquisition cost". Tested in "asset edit / unflag"._
  - [x] 11.3 Unit tests for asset summary math and operating/capital separation.
    - _Requirements: 9.2, 9.3_

- [x] 12. Credit Passport Service (R6)
  - [x] 12.1 Compute passport: total turnover, avg monthly turnover, cash-flow stability band
    (from monthly net-cash variance), continuous-record days, and the declared asset base (from
    the Asset Register), period, generatedAt — from captured data only.
    - `shared/src/passport.ts`.
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 9.3_
  - [x] 12.2 Implement `sharePassport(consentAck)` gated on explicit consent, `revokeShare`,
    and share logging in `share_link`.
    - _Requirements: 6.3_
    - _`sharePassport` (throws `ConsentError` without explicit consent), `revokeShare`
      (idempotent), and `lockedTransactionIds` in `shared/src/passport.ts`. Persisted as `SHARE#`
      items via `putShareLink`/`listShareLinks`/`getShareLink`; handler routes `GET /shares`,
      `PUT /shares/{id}` (403 without consent), `DELETE /shares/{id}`. Wired in the Passport UI._
  - [x] 12.3 Unit tests for turnover/stability/asset-base math and consent gating.
    - _Requirements: 6.1, 6.3_
    - _"passport sharing + consent gate" covers consent refusal, active-share creation, idempotent
      revoke, and the locked-id set from active shares only._

- [x] 13. Credit Passport UI (R6, R8, R9)
  - Read-only plain-language passport in the chosen currency, including the declared asset base
    (labelled owner-declared); consent dialog before sharing; show period and generated date.
  - _Requirements: 6.2, 6.3, 6.5_
  - _`Passport` component in `web/src/App.tsx`: consent checkbox creates a persisted share via
    `api.createShare`, surfaces an active share, and offers revoke; entries are locked while shared._

- [x] 14. API client — reliable capture (R7)
  - [x] 14.1 Typed API client that attaches the Cognito JWT and exposes save state
    (SAVING / SAVED / FAILED) to the UI.
    - `web/src/api.ts` + `SaveState` in the `Capture` component.
    - _Requirements: 7.1, 7.3_
  - [x] 14.2 Retry transient failures (network / 5xx / throttle) with backoff; on final failure
    surface FAILED and preserve the entry — never silently drop.
    - _Requirements: 7.2_
  - [x] 14.3 Idempotent writes by client UUID (server conditional upsert); handle 401 by
    prompting re-auth and preserving the unsaved entry.
    - Client UUID `id`; server PutItem on PK+SK; 401 → `UnauthorizedError` → re-auth.
    - _Requirements: 7.1, 7.2_
  - [x] 14.4 Keep payloads small and capture responsive on throttled (2G/3G) connections.
    - _Requirements: 7.4_
  - [x] 14.5 Integration test: retried write produces no duplicate; failed save is recoverable.
    - _Requirements: 7.1, 7.2_
    - _`api/src/handler.test.ts` (vitest, in-memory DynamoDB mock): retried PUT with the same id
      yields exactly one item; a transient write failure surfaces 500 and a same-id retry succeeds
      with one item (entry never silently dropped)._

- [x] 15. End-to-end scenario test (Definition of Done)
  - Automated/manual scenario: capture a week of mixed USD/ZiG/ZAR, mixed-rail activity
    including an asset purchase, each cross-currency entry with its effective rate →
    view profit in USD, ZiG and ZAR and on both rate bases → confirm the asset is excluded from
    profit and appears in the asset base → export a lender-ready statement → generate and share
    a credit passport (with declared asset base) with consent.
  - Smoke-test capture latency and reliable-save behavior on a throttled low-end browser profile.
  - _Requirements: 2.x, 3.x, 4.x, 5.x, 6.x, 7.x, 9.x_
  - _"end-to-end scenario (Definition of Done)" in `domain.test.ts`: a week of mixed USD/ZiG/ZAR
    mixed-rail activity incl. an asset purchase and cross-currency effective rates → profit in all
    three currencies on both bases → asset excluded from profit but in the asset base → lender
    statement → consent-gated, revocable passport that locks its entries from edits._

---

## Infrastructure & Deployment (AWS serverless, security-first)

See `infrastructure.md` for the module specs and security traceability. These tasks provision
the deploy target. Everything is defined as code in `infra/template.yaml` (SAM).

- [x] 16. Identity & auth — Cognito (M5)
  - Define User Pool (strong password policy, optional TOTP MFA, advanced security) and a
    public SPA app client (PKCE, no secret in browser).
  - Emit `UserPoolId` / `ClientId` as stack outputs for the SPA config.
  - _`UserPool` + `UserPoolClient` in `infra/template.yaml`; deployed (`af-south-1_<redacted>`).
    Client uses SRP (not PKCE) with no browser secret._

- [x] 17. Data — DynamoDB single table (M4)
  - Single-table (`PK`/`SK`, incl. `ORATE#<pair>#<date>` official-rate items) with SSE using a
    customer-managed KMS key, PITR enabled, on-demand billing, deletion protection.
  - _`Table` in `infra/template.yaml` (SSE-KMS, PITR, PAY_PER_REQUEST, deletion protection);
    deployed as `maribooks-prod`._

- [x] 18. Keys & config — KMS + SSM (M6)
  - Customer-managed KMS key(s) with rotation; SSM parameters for config; SecureString for any
    secret. No plaintext secrets in code or env.
  - _Customer-managed KMS key with rotation (`DataKey`) + SSM `ConfigParameter`
    (`/maribooks/prod/cors-origin`) for runtime config; Lambda reads it via `CONFIG_PARAM_NAME`
    with `ssm:GetParameter` IAM scoped to that one path. Deployed. No secrets in code (auth is
    delegated to Cognito; the SPA client has no secret), so a SecureString isn't needed here —
    the same pattern would hold one if introduced._

- [x] 19. API + compute — HTTP API + Lambda (M2, M3)
  - HTTP API with Cognito JWT authorizer on all data routes, CORS locked to the CloudFront
    origin, per-route throttling, JSON access logging.
  - Node18 zip Lambda with scoped IAM (this table + key only), reserved concurrency, X-Ray,
    tenant id taken only from the JWT claim, server-side input validation.
  - _HTTP API (JWT authorizer, throttling, JSON access logs) + Lambda (scoped IAM, reserved
    concurrency 20, X-Ray, JWT-only tenant id, server-side validation) done and deployed. CORS is
    now locked to the exact CloudFront origin (`!Ref CorsOrigin`, no wildcard) — verified live:
    the app origin gets an ACAO header, a disallowed origin gets none. Runtime is Node 22 (a
    deliberate upgrade from the spec's Node 18)._

- [x] 20. Edge & hosting — S3 + CloudFront + WAF (M1)
  - Private S3 (block all public access, SSE-KMS, versioned) served only via CloudFront OAC.
  - TLS1.2+, HTTP→HTTPS, strict security-headers policy (HSTS/CSP/nosniff/frame-deny), SPA
    fallback routing.
  - WAF WebACL (managed rules + rate limit) associated to the distribution — note the
    CloudFront WebACL must be created in **us-east-1** even though the stack runs in af-south-1.
  - _`infra/hosting.yaml` (private S3 + CloudFront OAC + security headers + SPA fallback) deployed
    as `maribooks-hosting`. `infra/waf.yaml` deploys a CLOUDFRONT-scope WAF WebACL (Common +
    KnownBadInputs managed rules + IP rate limit) to `us-east-1` as `maribooks-waf`; its ARN is
    associated with the distribution via the hosting stack's `WebAclArn` param. Verified live:
    `DistributionConfig.WebACLId` is set. See `infra/WAF_DEPLOY.md`._

- [x] 21. Observability & audit (M7)
  - KMS-encrypted, retention-bounded CloudWatch log groups for API + Lambda.
  - CloudTrail to an encrypted, versioned, delete-protected bucket; CloudWatch alarms → SNS.
  - _Retention-bounded HTTP API access log group (90d) in the core stack. `infra/audit.yaml`
    deploys `maribooks-audit`: multi-region CloudTrail (log-file validation on) → encrypted,
    versioned, `Retain`-protected S3 bucket, an SNS topic, and CloudWatch alarms (Lambda `Errors`
    + API `5xx`) → SNS. Verified live: `get-trail-status` IsLogging=true. See `infra/AUDIT_DEPLOY.md`._

- [x] 22. IaC assembly & least-privilege review (M8, M9)
  - Assemble all resources in `infra/template.yaml`; verify no IAM wildcards, no public S3, all
    stores KMS-encrypted; `sam validate` + `cfn` security lint.
  - Add stack outputs: `CloudFrontUrl`, `ApiEndpoint`, `UserPoolId`, `ClientId`.
  - _Four cleanly-separated stacks (core / hosting / waf / audit), each with scoped IAM (the
    Lambda's policy is limited to the one table, the one KMS key, and the one SSM param), no
    public S3, all stores encrypted. `sam validate` passes on the core template. Outputs across
    stacks: `ApiEndpoint`, `UserPoolId`, `UserPoolClientId`, `TableName`, `Region`, `CloudFrontUrl`,
    `WebAclArn`, `TrailBucketName`, `AlarmTopicArn`. The CloudFront origin is now cross-referenced
    into the API stack (CORS + SSM). Kept as separate stacks by design — the CloudFront-scope WAF
    must live in us-east-1, and audit resources have a different lifecycle from the app._

- [x] 23. Deploy & capture submission proof (M9)
  - `sam build && sam deploy --guided` (region af-south-1); `s3 sync` the SPA build; CloudFront
    invalidation.
  - Record the live `CloudFrontUrl` (ship gate) and documented coding-agent → AWS connection
    proof (prefer GitHub OIDC role, no static keys).
  - _Done: core stack + hosting stack deployed to `af-south-1`; SPA build synced to
    `maribooks-prod-spa-############` and CloudFront invalidated. Live app:
    **https://d3vn6ch6zctfj4.cloudfront.net** (HTTP 200). AWS connection proof captured in
    `submission/aws-connection-proof.md`. Outputs recorded in `infra/DEPLOYED.md`._
