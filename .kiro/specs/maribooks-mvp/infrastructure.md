# MariBooks — Infrastructure Architecture (AWS Serverless)

Deploy-ready blueprint for the MariBooks web app on AWS serverless. Because the platform
handles **financial information**, security is a first-class design constraint throughout:
least privilege, encryption everywhere, tenant isolation, no secrets in code, full auditability.

- **Delivery model:** static React SPA (public URL) + serverless API + managed data store.
- **IaC:** AWS SAM (`infra/template.yaml`), one stack, parameterized per environment.
- **Region:** `af-south-1` (Cape Town — closest to the Zimbabwean user base; override at deploy).
- **No Docker dependency:** Lambda packaged as zip (Node.js 18).

---

## 1. Infrastructure modules (overview)

| # | Module | AWS services | Purpose |
|---|---|---|---|
| M1 | Edge & hosting | CloudFront, S3, (optional) WAF | Serve the SPA over HTTPS at a public URL; block common web attacks |
| M2 | API layer | API Gateway (HTTP API) | Authenticated, throttled entry point to backend |
| M3 | Compute | Lambda (Node.js 18, zip) | Stateless sync API business logic |
| M4 | Data | DynamoDB (single table) | Per-tenant ledger, rates, profile; encrypted at rest |
| M5 | Identity & auth | Cognito User Pool + JWT authorizer | Owner sign-in; tenant identity on every request |
| M6 | Secrets & keys | KMS (CMKs), SSM Parameter Store | Encryption keys; runtime config; no secrets in code |
| M7 | Observability & audit | CloudWatch Logs/Alarms, CloudTrail, X-Ray | Traceability, alerting, tamper-evident audit trail |
| M8 | Security guardrails | IAM (least privilege), WAF, GuardDuty*, Config* | Defense in depth (*optional/recommended) |
| M9 | CI/CD & IaC | SAM, CloudFormation, GitHub OIDC role | Reproducible, credential-less deploys |

Everything in the core path (M1–M7) is in scope for the submission. M8 items marked `*`
(GuardDuty, Config) are recommended and cheap to enable but optional for the demo.

---

## 2. Reference architecture

```
                 ┌──────────────┐   HTTPS    ┌───────────────────────────┐
   Browser ─────►│  CloudFront  │◄───────────│ S3 (SPA assets, private)  │
   (SPA)         │  + WAF (M8)  │  OAC only   └───────────────────────────┘
      │          └──────┬───────┘
      │  JWT (Cognito)  │  /api/* behavior
      ▼                 ▼
 ┌──────────┐    ┌──────────────────┐   JWT authorizer   ┌──────────────┐
 │ Cognito  │───►│ API Gateway      │───────────────────►│   Lambda     │
 │ User Pool│    │ (HTTP API, M2)   │   throttle + CORS   │ (Node18, M3) │
 └──────────┘    └──────────────────┘                    └──────┬───────┘
                                                                 │ IAM (least priv)
                                                          ┌──────▼───────┐
                                                          │  DynamoDB     │  SSE-KMS,
                                                          │  (M4)         │  PITR on
                                                          └──────────────┘
   KMS (M6) encrypts: S3, DynamoDB, CloudWatch Logs, SSM SecureString
   CloudTrail (M7) records all control-plane API calls; X-Ray traces requests
```

Data-flow security summary: TLS in transit end to end; JWT-scoped tenant on every write;
Lambda can touch only this table; every item encrypted at rest with a customer-managed key;
all access logged.

---

## 3. Module specifications

### M1 — Edge & hosting (CloudFront + S3 + WAF)
**Purpose:** serve the SPA at the public URL judges reach, securely.
- **S3 bucket** holds SPA build artifacts. Bucket is **private**: `BlockPublicAcls`,
  `BlockPublicPolicy`, `IgnorePublicAcls`, `RestrictPublicBuckets` all `true`.
- **CloudFront** is the only reader, via **Origin Access Control (OAC)** — no public S3 URL.
- **Viewer protocol policy:** redirect HTTP→HTTPS; **TLS 1.2+** minimum.
- **Security headers** via a CloudFront response-headers policy: HSTS, `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a strict
  **Content-Security-Policy** (self + the API origin only).
- **AWS WAF** (M8) attached to CloudFront with AWS Managed Rules (common, known-bad-inputs,
  IP-reputation) and a rate-based rule.
- **SPA routing:** 403/404 → `/index.html` (200) so client-side routing works.

### M2 — API layer (API Gateway HTTP API)
- **HTTP API** (cheaper/faster than REST API) with a **JWT authorizer** bound to the Cognito
  User Pool (M5); no unauthenticated data routes.
- **CORS** locked to the CloudFront domain only (no `*`).
- **Throttling:** per-route rate and burst limits to blunt abuse/DoS and cap cost.
- **Access logging** to CloudWatch in JSON (requestId, principal/tenant, route, status,
  latency) — feeds M7.
- **Routes** (all require JWT):
  - `PUT /transactions/{id}` — idempotent upsert
  - `GET /transactions?from&to` — list tenant ledger in range
  - `DELETE /transactions/{id}`
  - `GET /rates` / `PUT /rates/{date}` — rate table read / manual upsert
  - `GET /profile` / `PUT /profile`

### M3 — Compute (Lambda, Node.js 18, zip)
- **Single function** with lightweight internal routing (keeps the surface small and auditable).
- **Runtime hardening:** minimal deps; `NODE_OPTIONS` no debug; timeout ~10s; small memory;
  reserved concurrency cap to bound blast radius and cost.
- **Tenant enforcement in code:** the tenant id comes **only** from the validated JWT claim
  (`sub`/custom claim), never from the request body — prevents cross-tenant access.
- **Input validation:** every payload validated (amount > 0, currency ∈ {USD,ZiG}, rail ∈ set,
  decimal-safe money) before any write; reject on failure with 400.
- **No secrets in code/env plaintext:** config from SSM; secrets as SecureString via KMS.
- **Structured JSON logs** with correlation id; **X-Ray** tracing enabled.

### M4 — Data (DynamoDB single table)
- **Single-table design** (see design.md): `PK=TENANT#<id>`, `SK=TXN#<id>|ORATE#<pair>#<date>|PROFILE`.
- **Encryption at rest:** SSE with a **customer-managed KMS key** (M6), not the AWS-owned key.
- **Point-in-time recovery (PITR):** enabled (financial data — recoverability required).
- **On-demand billing:** no capacity planning; scales to zero cost when idle.
- **Idempotent writes:** `PutItem` keyed by `PK`+`SK` (client UUID) — retries never duplicate.
- **Deletion protection:** enabled on the table.
- **No PII beyond what the owner enters;** the tenant partition isolates each business's data.

### M5 — Identity & auth (Cognito)
- **Cognito User Pool** for owner accounts: email + strong password policy, **MFA optional**
  (recommended TOTP), account-recovery via email, advanced security mode.
- **App client** (SPA, public client, PKCE, no client secret in the browser).
- **JWT** access token carries the tenant identity used by M2/M3.
- **Token TTLs:** short access token, rotating refresh; sign-out revokes refresh.
- Rationale: even for a demo, financial data must not sit behind an anonymous API. Cognito
  gives per-owner tenant isolation with no custom auth code.

### M6 — Secrets & keys (KMS + SSM)
- **KMS customer-managed keys (CMKs):** one for data (DynamoDB, S3), key rotation **enabled**.
- **SSM Parameter Store:** runtime config (table name, API origin) as String; any secret as
  **SecureString** encrypted with KMS. Lambda reads at cold start; **nothing sensitive in
  plaintext env vars or source**.
- **Key policies** grant decrypt only to the specific Lambda execution role.

### M7 — Observability & audit
- **CloudWatch Logs:** Lambda + API Gateway access logs; **log group encryption with KMS**;
  retention set (e.g. 90 days) rather than never-expire.
- **CloudTrail:** management events recorded to a dedicated, **encrypted, versioned** S3 bucket
  with a bucket policy denying deletes — a tamper-evident audit trail (important for financial
  data provenance).
- **CloudWatch Alarms:** Lambda errors/throttles, API 5xx rate, DynamoDB throttles → SNS.
- **X-Ray:** end-to-end request tracing for debugging and latency SLOs.

### M8 — Security guardrails (defense in depth)
- **IAM least privilege:** Lambda role scoped to *this* table's ARN and *this* KMS key only;
  no wildcards. No long-lived IAM users for humans.
- **WAF** on CloudFront (see M1).
- **GuardDuty*** for threat detection; **AWS Config*** for drift/compliance rules
  (e.g. "no public S3", "DynamoDB encrypted"). Marked optional for the demo.
- **No inline credentials anywhere;** deploys use short-lived roles (M9).

### M9 — CI/CD & IaC
- **AWS SAM** builds and deploys the whole stack from `infra/template.yaml`.
- **GitHub OIDC deploy role** (recommended): CI assumes a short-lived role — **no static AWS
  keys in the repo or CI secrets**. This also gives clean, documentable proof of the coding
  agent → AWS connection for the submission.
- **Parameterized environments** (`dev`/`prod`) via SAM parameters; stack outputs expose the
  **CloudFront URL** (public app) and **API endpoint**.

---

## 4. Security requirements traceability

| Concern | Control | Module |
|---|---|---|
| Data encrypted at rest | KMS CMK on DynamoDB, S3, Logs, SSM | M4, M6, M7 |
| Data encrypted in transit | TLS1.2+ everywhere; HTTP→HTTPS redirect | M1, M2 |
| No anonymous access to financial data | Cognito JWT authorizer on all data routes | M2, M5 |
| Tenant isolation | tenant id from JWT claim only; per-tenant partition | M3, M4 |
| Least privilege | scoped IAM role (table + key ARNs only) | M8 |
| No secrets in code | SSM SecureString + KMS; OIDC deploy role | M6, M9 |
| Recoverability | DynamoDB PITR + deletion protection | M4 |
| Auditability | CloudTrail (immutable bucket) + access logs | M7 |
| Web attack surface | WAF managed rules + rate limit; strict CSP/HSTS | M1 |
| Abuse / cost blast radius | API throttling + Lambda reserved concurrency | M2, M3 |
| Input integrity | server-side validation before any write | M3 |

---

## 5. `infra/template.yaml` resource plan (SAM)

Resources the template will declare (implemented in task M6/#6 of the build plan):
- `AWS::S3::Bucket` (SPA, private, SSE-KMS, versioned)
- `AWS::CloudFront::Distribution` + `OriginAccessControl` + `ResponseHeadersPolicy`
- `AWS::WAFv2::WebACL` (CLOUDFRONT scope) + association
- `AWS::Cognito::UserPool` + `UserPoolClient`
- `AWS::Serverless::HttpApi` (JWT authorizer, CORS, access logging, throttling)
- `AWS::Serverless::Function` (Node18, zip, X-Ray, reserved concurrency, scoped policies)
- `AWS::DynamoDB::Table` (single table, SSE-KMS, PITR, deletion protection)
- `AWS::KMS::Key` (+ alias, rotation) and key policy
- `AWS::SSM::Parameter` entries (config; SecureString for any secret)
- `AWS::Logs::LogGroup` (KMS-encrypted, retention) for API + Lambda
- CloudTrail trail + encrypted/versioned log bucket with delete-deny policy
- **Outputs:** `CloudFrontUrl` (public app URL), `ApiEndpoint`, `UserPoolId`, `ClientId`

## 6. Deployment procedure (once AWS access is provided)

```
# 1. Authenticate (user provides account/login)
aws sso login            # or: aws configure / assume role

# 2. Build & deploy the stack
sam build
sam deploy --guided      # first time: sets stack name, region af-south-1, params

# 3. Publish the SPA to the hosting bucket, then invalidate the CDN
aws s3 sync web/dist s3://<SpaBucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistId> --paths "/*"

# 4. Record outputs for the submission
#    - CloudFrontUrl  -> live public URL (ship gate)
#    - proof of coding-agent -> AWS connection (see submission checklist)
```

## 7. Cost & footprint (demo scale)
All services are serverless/on-demand and scale to near-zero at rest: DynamoDB on-demand,
Lambda per-invocation, CloudFront/S3 pennies at demo traffic, Cognito free tier covers a
handful of demo users. Expected demo cost is well within the $5,000 credit prize context and
typically a few dollars/month idle.

## 8. Open items (need AWS account details)
- AWS account id / SSO or role for deploy — **user to provide**.
- Confirm region (`af-south-1`, Cape Town) and any org SCP/guardrail constraints.
- Custom domain + ACM certificate? Optional; CloudFront default domain satisfies the public-URL
  requirement without one.
- Decide whether to enable GuardDuty/Config for the demo (recommended, small cost).
