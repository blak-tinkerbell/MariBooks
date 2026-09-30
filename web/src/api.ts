/**
 * Typed API client. Attaches the Cognito ID token to every request, retries transient
 * failures with backoff, and surfaces save state. Never silently drops a write.
 */
import type {
  BusinessProfile,
  OfficialRate,
  ShareLink,
  SmsDraft,
  Transaction,
} from "@maribooks/shared";
import { getIdToken } from "./auth.js";
import { config } from "./config.js";

export type SaveState = "SAVING" | "SAVED" | "FAILED";

export class UnauthorizedError extends Error {}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new UnauthorizedError("Not signed in");

  let res: Response;
  try {
    res = await fetch(`${config.apiEndpoint}${path}`, {
      method,
      headers: {
        authorization: token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Transient network error — retry with backoff up to 3 times.
    if (attempt < 3) {
      await delay(250 * 2 ** attempt);
      return request<T>(method, path, body, attempt + 1);
    }
    throw networkErr;
  }

  if (res.status === 401) throw new UnauthorizedError("Session expired");
  if (res.status === 204) return undefined as T;

  if (res.status >= 500 && attempt < 3) {
    await delay(250 * 2 ** attempt);
    return request<T>(method, path, body, attempt + 1);
  }

  if (!res.ok) {
    const msg = await safeError(res);
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api = {
  listTransactions: () => request<Transaction[]>("GET", "/transactions"),
  putTransaction: (txn: Transaction) =>
    request<Transaction>("PUT", `/transactions/${txn.id}`, txn),
  deleteTransaction: (id: string) =>
    request<void>("DELETE", `/transactions/${id}`),
  getRates: () => request<OfficialRate[]>("GET", "/rates"),
  putRate: (rate: OfficialRate) =>
    request<void>("PUT", `/rates/${rate.date}`, rate),
  getProfile: () => request<BusinessProfile>("GET", "/profile"),
  putProfile: (p: BusinessProfile) => request<void>("PUT", "/profile", p),
  listShares: () => request<ShareLink[]>("GET", "/shares"),
  createShare: (link: {
    id: string;
    consentAck: boolean;
    currency: ShareLink["currency"];
    basis?: ShareLink["basis"];
    transactionIds: string[];
    note?: string;
  }) => request<ShareLink>("PUT", `/shares/${link.id}`, link),
  revokeShare: (id: string) => request<ShareLink>("DELETE", `/shares/${id}`),
  parseSms: (text: string) => request<SmsDraft>("POST", "/parse", { text }),
};
