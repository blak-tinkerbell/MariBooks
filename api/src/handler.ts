/**
 * MariBooks sync API — single Lambda behind API Gateway HTTP API with a Cognito JWT authorizer.
 *
 * Security invariants:
 *  - Tenant identity comes ONLY from the validated JWT claim (never the request body).
 *  - Every write is validated server-side before it touches the store.
 *  - Writes are idempotent by client-generated id (DynamoDB PutItem on PK+SK).
 */
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  assertDeletable,
  buildTransaction,
  editTransaction,
  LockedTransactionError,
  lockedTransactionIds,
  revokeShare,
  sharePassport,
  ConsentError,
  ValidationError,
  type BusinessProfile,
  type NewTransactionInput,
  type OfficialRate,
  type ShareLink,
  type Transaction,
} from "@maribooks/shared";
import {
  deleteTransaction,
  getProfile,
  getShareLink,
  getTransaction,
  listOfficialRates,
  listShareLinks,
  listTransactions,
  putOfficialRate,
  putProfile,
  putShareLink,
  putTransaction,
} from "./db.js";
import { parseSms } from "./ai.js";
import {
  isAllowedContentType,
  keyBelongsToTenant,
  presignUpload,
  presignView,
  proofEnabled,
} from "./s3.js";
import { scanReceipt } from "./receipt.js";

type Event = APIGatewayProxyEventV2WithJWTAuthorizer;

const JSON_HEADERS = { "content-type": "application/json" };

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/** Tenant id from the JWT authorizer claims — the ONLY source of tenant identity. */
function tenantFrom(event: Event): string | null {
  const claims = event.requestContext.authorizer?.jwt?.claims as
    | Record<string, string>
    | undefined;
  return claims?.sub ?? null;
}

function parseBody<T>(event: Event): T {
  if (!event.body) throw new ValidationError("Missing request body");
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

export const handler = async (
  event: Event,
): Promise<APIGatewayProxyResultV2> => {
  const tenantId = tenantFrom(event);
  if (!tenantId) return json(401, { error: "Unauthenticated" });

  const method = event.requestContext.http.method;
  const route = event.routeKey; // e.g. "PUT /transactions/{id}"
  const id = event.pathParameters?.id;

  try {
    switch (route) {
      case "GET /transactions":
        return json(200, await listTransactions(tenantId));

      case "PUT /transactions/{id}": {
        const input = parseBody<NewTransactionInput>(event);
        if (id && input.id !== id) {
          return json(400, { error: "Path id and body id must match" });
        }
        const locked = lockedTransactionIds(await listShareLinks(tenantId));
        const existing = id ? await getTransaction(tenantId, id) : null;
        let txn: Transaction;
        if (existing) {
          // Edit path: re-validate and enforce the share lock.
          txn = editTransaction(existing, input, { lockedIds: locked });
        } else {
          // Create path: buildTransaction validates and stamps timestamps.
          txn = buildTransaction(input);
        }
        await putTransaction(tenantId, txn); // idempotent by PK+SK
        return json(200, txn);
      }

      case "DELETE /transactions/{id}": {
        if (!id) return json(400, { error: "Missing id" });
        const locked = lockedTransactionIds(await listShareLinks(tenantId));
        assertDeletable(id, locked);
        await deleteTransaction(tenantId, id);
        return json(204, {});
      }

      case "POST /parse": {
        const body = parseBody<{ text?: string }>(event);
        const text = (body.text ?? "").trim();
        if (!text) return json(400, { error: "Paste the SMS text" });
        if (text.length > 800) return json(400, { error: "That message is too long (800 characters max)" });
        return json(200, await parseSms(text));
      }

      case "POST /proof/upload-url": {
        // Mint a presigned URL so the browser can upload one invoice/receipt straight to S3.
        if (!proofEnabled()) return json(501, { error: "Proof uploads are not configured" });
        const body = parseBody<{ contentType?: string }>(event);
        const contentType = (body.contentType ?? "").trim();
        if (!isAllowedContentType(contentType)) {
          return json(400, { error: "Upload a JPG, PNG, WEBP, HEIC or PDF" });
        }
        return json(200, await presignUpload(tenantId, contentType));
      }

      case "POST /proof/scan": {
        // Extract fields from an already-uploaded receipt/invoice with Amazon Textract.
        if (!proofEnabled()) return json(501, { error: "Proof uploads are not configured" });
        const body = parseBody<{ key?: string; kind?: "RECEIPT" | "INVOICE" }>(event);
        const key = (body.key ?? "").trim();
        const kind = body.kind === "INVOICE" ? "INVOICE" : "RECEIPT";
        if (!key || !keyBelongsToTenant(tenantId, key)) {
          return json(400, { error: "Unknown file" });
        }
        try {
          return json(200, await scanReceipt(tenantId, key, kind));
        } catch (e) {
          console.warn("Textract scan failed", e);
          // Scanning is best-effort; the owner can still fill the form by hand.
          return json(200, { kind, confidence: "LOW", source: "TEXTRACT" });
        }
      }

      case "GET /proof/view": {
        // Return a short-lived URL for the owner to view their own proof file.
        if (!proofEnabled()) return json(501, { error: "Proof uploads are not configured" });
        const key = (event.queryStringParameters?.key ?? "").trim();
        if (!key || !keyBelongsToTenant(tenantId, key)) {
          return json(400, { error: "Unknown file" });
        }
        return json(200, { url: await presignView(key) });
      }

      case "GET /rates":
        return json(200, await listOfficialRates(tenantId));

      case "PUT /rates/{date}": {
        const rate = parseBody<OfficialRate>(event);
        // basic shape validation
        if (!rate.pair || !rate.date || !rate.rate) {
          return json(400, { error: "pair, date and rate are required" });
        }
        await putOfficialRate(tenantId, { ...rate, source: "MANUAL" });
        return json(200, { ok: true });
      }

      case "GET /profile": {
        const profile = await getProfile(tenantId);
        return profile ? json(200, profile) : json(404, { error: "No profile" });
      }

      case "PUT /profile": {
        const profile = parseBody<BusinessProfile>(event);
        if (!profile.name || !profile.reportingCurrency) {
          return json(400, { error: "name and reportingCurrency are required" });
        }
        const now = new Date().toISOString();
        await putProfile(tenantId, {
          ...profile,
          id: tenantId,
          createdAt: profile.createdAt ?? now,
          updatedAt: now,
        });
        return json(200, { ok: true });
      }

      case "GET /shares":
        return json(200, await listShareLinks(tenantId));

      case "PUT /shares/{id}": {
        const body = parseBody<{
          consentAck: boolean;
          currency: ShareLink["currency"];
          basis?: ShareLink["basis"];
          transactionIds: string[];
          note?: string;
        }>(event);
        if (!id) return json(400, { error: "Missing id" });
        // sharePassport throws ConsentError unless consent is explicit.
        const link = sharePassport({
          id,
          consentAck: body.consentAck,
          currency: body.currency,
          basis: body.basis,
          transactionIds: body.transactionIds ?? [],
          note: body.note,
        });
        await putShareLink(tenantId, link);
        return json(200, link);
      }

      case "DELETE /shares/{id}": {
        if (!id) return json(400, { error: "Missing id" });
        const link = await getShareLink(tenantId, id);
        if (!link) return json(404, { error: "No such share" });
        const revoked = revokeShare(link);
        await putShareLink(tenantId, revoked);
        return json(200, revoked);
      }

      default:
        return json(404, { error: `No route for ${method} ${route}` });
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    if (err instanceof LockedTransactionError) {
      return json(409, { error: err.message });
    }
    if (err instanceof ConsentError) {
      return json(403, { error: err.message });
    }
    console.error("Unhandled error", err);
    return json(500, { error: "Internal error" });
  }
};
