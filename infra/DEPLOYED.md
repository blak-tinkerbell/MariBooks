# Deployed stacks — MariBooks

Account: `985923204885` · Profile: `MariBooks` · Primary region: `af-south-1`
(WAF in `us-east-1`, required for CloudFront scope). All four stacks deployed and verified live.

## Public app URL (ship gate) ✅
**https://d3vn6ch6zctfj4.cloudfront.net** — live, serves HTTP 200.

## Verified live (2026-10-01)
- App root + SPA fallback routing return 200; served `index.html` references the current bundle.
- API `GET /transactions` unauthenticated → **401** (Cognito JWT authorizer enforced).
- CORS locked to the app origin: `https://d3vn6ch6zctfj4.cloudfront.net` gets an
  `access-control-allow-origin` header; a disallowed origin gets **none**.
- CloudFront `DistributionConfig.WebACLId` is set to the WAF WebACL ARN.
- SSM `/maribooks/prod/cors-origin` resolves to the app origin.
- CloudTrail `maribooks-prod-trail` `IsLogging` = **true**.
- Test suite: **48 pass** (44 shared domain + 4 API integration). All workspaces build clean.

## Core stack — `maribooks-prod` (af-south-1)

| Output / resource | Value |
|---|---|
| API endpoint | `https://h6khi16q5m.execute-api.af-south-1.amazonaws.com/prod` |
| Cognito User Pool | `af-south-1_EsVd6dQTv` |
| Cognito App Client | `3b8gsvgbvteake88t6dnke70ci` |
| DynamoDB table | `maribooks-prod` (SSE-KMS, PITR, deletion protection) |
| Lambda | `maribooks-prod-ApiFunction-uTnkm0cJY2Ot` (Node 22, arm64, X-Ray, reserved concurrency 20) |
| SSM config param | `/maribooks/prod/cors-origin` |
| KMS key | customer-managed, rotation enabled (`alias/maribooks-prod-data`) |

Data routes require a Cognito JWT; tenant id comes only from the `sub` claim. IAM is scoped to
the one table, the one KMS key, the one SSM parameter, the proof bucket, and `textract:AnalyzeExpense`.
Routes include transactions, rates, profile, the consent-gated `GET/PUT/DELETE /shares`, and the
proof routes (`POST /proof/upload-url`, `POST /proof/scan`, `GET /proof/view`).

| Proof store (invoices/receipts) | S3 `maribooks-prod-proof-985923204885` (private, SSE-KMS, versioned, CORS to app origin) |
| Receipt reader | Amazon Textract `AnalyzeExpense` (on-demand, no stored model) |

Proof files are uploaded by the browser via short-lived presigned URLs and never pass through
Lambda; every object key is forced under the owner's `TENANT#<sub>/proof/` prefix.

## Hosting stack — `maribooks-hosting` (af-south-1)

| Output / resource | Value |
|---|---|
| CloudFront URL | `https://d3vn6ch6zctfj4.cloudfront.net` |
| Distribution ID | `E1QN9VIES8PZAU` |
| SPA S3 bucket | `maribooks-prod-spa-985923204885` (private, OAC only, versioned, encrypted) |
| WAF association | `WebAclArn` param → `DistributionConfig.WebACLId` |

Private S3 served only via CloudFront OAC; HTTPS-only; HSTS/nosniff/frame-deny response headers;
SPA fallback (403/404 → `index.html`). Redeploy the SPA after a rebuild:

```bash
npm run build --workspace web
aws s3 sync web/dist s3://maribooks-prod-spa-985923204885 --delete --profile MariBooks --region af-south-1
aws cloudfront create-invalidation --distribution-id E1QN9VIES8PZAU --paths "/*" --profile MariBooks
```

## WAF stack — `maribooks-waf` (us-east-1)

| Output / resource | Value |
|---|---|
| WebACL ARN | `arn:aws:wafv2:us-east-1:985923204885:global/webacl/maribooks-prod-cf-webacl/0580f0d2-2e97-4115-b83d-fd55f4036baa` |
| Rules | AWSManagedRulesCommonRuleSet, AWSManagedRulesKnownBadInputsRuleSet, IP rate limit (2000 / 5 min) |

CLOUDFRONT-scope WebACL (must live in us-east-1). Deploy/associate procedure in `infra/WAF_DEPLOY.md`.

## Audit stack — `maribooks-audit` (af-south-1)

| Output / resource | Value |
|---|---|
| CloudTrail | `maribooks-prod-trail` (multi-region, log-file validation on) |
| Trail bucket | encrypted, versioned, `Retain`-protected |
| SNS topic | `maribooks-prod-alarms` |
| Alarms | Lambda `Errors` + API `5xx` → SNS |

Deploy/params (Lambda name, HTTP API id, optional alarm email) documented in `infra/AUDIT_DEPLOY.md`.

## Deploying proof uploads + Textract (Oct 2026)

The core stack gains an S3 proof bucket, three `/proof/*` routes, and `textract:AnalyzeExpense`
IAM. Deploy the API (`sam deploy`) first so the bucket and routes exist, then rebuild and sync
the web app. No Bedrock change is needed. Verify after deploy:

```bash
# API: proof routes + bucket. SAM creates the bucket and wires PROOF_BUCKET automatically.
npm run build
cd infra && sam build && sam deploy --profile MariBooks --region af-south-1
cd ..
# Confirm the proof bucket output and that an unauthenticated proof call is rejected (401):
aws cloudformation describe-stacks --stack-name maribooks-prod --profile MariBooks --region af-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ProofBucketName'].OutputValue" --output text
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://h6khi16q5m.execute-api.af-south-1.amazonaws.com/prod/proof/upload-url
# Then rebuild + redeploy the web app (same sync + invalidate as below).
```

**Region note (verified against AWS docs):** Amazon Textract is **not** offered in af-south-1,
and `AnalyzeExpense` with an S3 object requires the bucket and the Textract call to be in the
**same** region. So receipt *storage* works in af-south-1, but *scanning* does not run there. To
enable scanning, deploy the proof bucket in a Textract region (e.g. `eu-west-1`) as its own small
stack and set `TextractRegion` to match. Until then the feature degrades gracefully: the file
still uploads and attaches, and the owner fills the form by hand (the scan call returns a
low-confidence empty draft, never an error to the user).

## Deploying the redesign + SMS parsing (Oct 2026)

The web redesign is a static rebuild. The API gains `POST /parse` (payment-SMS parsing), so the
core stack needs one `sam deploy` too.

```bash
# 1. API: new /parse route. Leave BedrockModelId empty to use the rules parser only.
npm run build
cd infra && sam build && sam deploy --profile MariBooks --region af-south-1
#   To enable the optional Bedrock step (after enabling model access in the Bedrock console):
#   sam deploy ... --parameter-overrides BedrockModelId=<model or inference-profile id> BedrockRegion=<region>
cd ..

# 2. Web: build with the stack outputs, sync and invalidate.
VITE_API_ENDPOINT=https://h6khi16q5m.execute-api.af-south-1.amazonaws.com/prod \
VITE_USER_POOL_ID=af-south-1_EsVd6dQTv \
VITE_USER_POOL_CLIENT_ID=3b8gsvgbvteake88t6dnke70ci \
npm run build --workspace web
aws s3 sync web/dist s3://maribooks-prod-spa-985923204885 --delete --profile MariBooks --region af-south-1
aws cloudfront create-invalidation --distribution-id E1QN9VIES8PZAU --paths "/*" --profile MariBooks
```

Then check in a private window: `/` shows sign-in with "Try the demo", `/?demo` opens the demo
dashboard, and `/sw.js` + `/manifest.webmanifest` return 200.
