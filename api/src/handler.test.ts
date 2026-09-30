/**
 * Integration test for the sync API Lambda handler (task 14.5):
 *   "retried write produces no duplicate; failed save is recoverable."
 *
 * The DynamoDB layer (./db.js) is mocked with an in-memory Map-backed fake that
 * mimics idempotent PutItem-on-PK+SK semantics: the item key is SK = `TXN#<id>`,
 * so re-sending the same client-generated id overwrites and yields exactly one
 * item. No real AWS calls are made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BusinessProfile,
  OfficialRate,
  ShareLink,
  Transaction,
} from "@maribooks/shared";

// ---- in-memory store keyed like the real single table (PK -> SK -> item) ----
const store = new Map<string, Map<string, Record<string, unknown>>>();
const pk = (tenantId: string) => `TENANT#${tenantId}`;

function tenantTable(tenantId: string): Map<string, Record<string, unknown>> {
  let t = store.get(pk(tenantId));
  if (!t) {
    t = new Map();
    store.set(pk(tenantId), t);
  }
  return t;
}

// A per-test hook that lets a single putTransaction call fail transiently.
let failNextPut = false;

vi.mock("./db.js", () => ({
  putTransaction: vi.fn(async (tenantId: string, txn: Transaction) => {
    if (failNextPut) {
      failNextPut = false;
      throw new Error("Transient DynamoDB write failure");
    }
    // Idempotent PutItem on PK+SK: same SK overwrites -> exactly one item.
    tenantTable(tenantId).set(`TXN#${txn.id}`, { ...txn });
  }),
  getTransaction: vi.fn(async (tenantId: string, id: string) => {
    return (tenantTable(tenantId).get(`TXN#${id}`) as Transaction) ?? null;
  }),
  listTransactions: vi.fn(async (tenantId: string) => {
    return [...tenantTable(tenantId).entries()]
      .filter(([sk]) => sk.startsWith("TXN#"))
      .map(([, item]) => item as Transaction);
  }),
  deleteTransaction: vi.fn(async (tenantId: string, id: string) => {
    tenantTable(tenantId).delete(`TXN#${id}`);
  }),
  listShareLinks: vi.fn(async (tenantId: string) => {
    return [...tenantTable(tenantId).entries()]
      .filter(([sk]) => sk.startsWith("SHARE#"))
      .map(([, item]) => item as ShareLink);
  }),
  putShareLink: vi.fn(async (tenantId: string, link: ShareLink) => {
    tenantTable(tenantId).set(`SHARE#${link.id}`, { ...link });
  }),
  getShareLink: vi.fn(async (tenantId: string, id: string) => {
    return (tenantTable(tenantId).get(`SHARE#${id}`) as ShareLink) ?? null;
  }),
  putProfile: vi.fn(async (tenantId: string, profile: BusinessProfile) => {
    tenantTable(tenantId).set("PROFILE", { ...profile });
  }),
  getProfile: vi.fn(async (tenantId: string) => {
    return (tenantTable(tenantId).get("PROFILE") as BusinessProfile) ?? null;
  }),
  putOfficialRate: vi.fn(async (tenantId: string, rate: OfficialRate) => {
    tenantTable(tenantId).set(`ORATE#${rate.pair}#${rate.date}`, { ...rate });
  }),
  listOfficialRates: vi.fn(async (tenantId: string) => {
    return [...tenantTable(tenantId).entries()]
      .filter(([sk]) => sk.startsWith("ORATE#"))
      .map(([, item]) => item as OfficialRate);
  }),
}));

// Import AFTER the mock is registered so the handler binds to the fake db.
const { handler } = await import("./handler.js");

// ---- synthetic API Gateway HTTP API v2 (JWT authorizer) event builder ----
const TENANT = "tenant-abc-123";

function makeEvent(opts: {
  routeKey: string;
  method: string;
  sub?: string | null;
  pathParameters?: Record<string, string>;
  body?: unknown;
}) {
  const { routeKey, method, sub = TENANT, pathParameters, body } = opts;
  const claims: Record<string, string> = {};
  if (sub) claims.sub = sub;
  return {
    version: "2.0",
    routeKey,
    rawPath: routeKey.split(" ")[1] ?? "/",
    rawQueryString: "",
    headers: {},
    pathParameters,
    isBase64Encoded: false,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: {
      http: {
        method,
        path: routeKey.split(" ")[1] ?? "/",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      authorizer: { jwt: { claims, scopes: [] } },
      routeKey,
      accountId: "123456789012",
      apiId: "test-api",
      domainName: "test.execute-api.local",
      domainPrefix: "test",
      requestId: "req-" + Math.random().toString(16).slice(2),
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const TXN_ID = "txn-fixed-0001";

function putTxnEvent() {
  return makeEvent({
    routeKey: "PUT /transactions/{id}",
    method: "PUT",
    pathParameters: { id: TXN_ID },
    body: {
      id: TXN_ID,
      direction: "IN",
      amount: "100.00",
      currency: "USD",
      rail: "ECOCASH",
      category: "SALES",
      date: "2026-01-05",
    },
  });
}

function listTxnEvent() {
  return makeEvent({ routeKey: "GET /transactions", method: "GET" });
}

beforeEach(() => {
  store.clear();
  failNextPut = false;
  vi.clearAllMocks();
});

describe("API handler — idempotent + recoverable writes (task 14.5)", () => {
  it("A: a retried write with the same client id produces no duplicate", async () => {
    const first = await handler(putTxnEvent());
    const second = await handler(putTxnEvent());

    expect((first as { statusCode: number }).statusCode).toBe(200);
    expect((second as { statusCode: number }).statusCode).toBe(200);

    const listed = await handler(listTxnEvent());
    expect((listed as { statusCode: number }).statusCode).toBe(200);
    const txns = JSON.parse((listed as { body: string }).body) as Transaction[];

    // Exactly one item despite two writes with the same id.
    expect(txns).toHaveLength(1);
    expect(txns[0]!.id).toBe(TXN_ID);
  });

  it("B: a failed save is recoverable — retry succeeds with exactly one item", async () => {
    // First write hits a transient store failure.
    failNextPut = true;
    const failed = await handler(putTxnEvent());
    expect((failed as { statusCode: number }).statusCode).toBe(500);

    // Nothing was persisted by the failed attempt.
    let listed = await handler(listTxnEvent());
    let txns = JSON.parse((listed as { body: string }).body) as Transaction[];
    expect(txns).toHaveLength(0);

    // The client retries the same id (the entry is preserved/recoverable,
    // not silently dropped) and now succeeds.
    const retry = await handler(putTxnEvent());
    expect((retry as { statusCode: number }).statusCode).toBe(200);

    listed = await handler(listTxnEvent());
    txns = JSON.parse((listed as { body: string }).body) as Transaction[];
    expect(txns).toHaveLength(1);
    expect(txns[0]!.id).toBe(TXN_ID);
  });
});

describe("POST /parse — paste a payment SMS", () => {
  it("returns a draft from the rules parser (no Bedrock configured)", async () => {
    const res = (await handler(
      makeEvent({
        routeKey: "POST /parse",
        method: "POST",
        body: { text: "EcoCash: You have received USD 25.00 from TENDAI MOYO. New wallet balance: USD 140.50" },
      }),
    )) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ amount: "25.00", currency: "USD", direction: "IN", rail: "ECOCASH", source: "RULES" });
  });

  it("rejects an empty paste", async () => {
    const res = (await handler(makeEvent({ routeKey: "POST /parse", method: "POST", body: { text: "  " } }))) as { statusCode: number };
    expect(res.statusCode).toBe(400);
  });
});
