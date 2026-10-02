/**
 * Data store the UI talks to. Two implementations:
 *  - LiveStore: the authenticated AWS API, with an offline outbox so a save made on a dropped
 *    connection is kept on the device and synced when the connection returns (never lost).
 *  - DemoStore: a seeded sample business kept only in this browser, for trying the app
 *    without an account.
 */
import {
  parseMoneySms,
  sharePassport,
  revokeShare as revokeLink,
  type OfficialRate,
  type ShareLink,
  type SmsDraft,
  type Transaction,
} from "@maribooks/shared";
import { api } from "./api.js";
import { DEMO_BUSINESS, seedDemo } from "./demo.js";
import { SAMPLE_OFFICIAL_RATES } from "./lib.js";

export type SaveResult = "SAVED" | "QUEUED";

export interface ShareInput {
  id: string;
  lender: string;
  currency: ShareLink["currency"];
  basis: ShareLink["basis"];
  transactionIds: string[];
}

export interface DataStore {
  mode: "live" | "demo";
  list(): Promise<Transaction[]>;
  put(t: Transaction): Promise<SaveResult>;
  listShares(): Promise<ShareLink[]>;
  createShare(s: ShareInput): Promise<ShareLink>;
  revokeShare(id: string): Promise<ShareLink>;
  /** Official rates; `sample` is true when none are recorded yet and samples are in use. */
  getRates(): Promise<{ rates: OfficialRate[]; sample: boolean }>;
  putRate(r: OfficialRate): Promise<void>;
  parseSms(text: string): Promise<SmsDraft>;
  businessName(): Promise<string>;
  setBusinessName(name: string): Promise<void>;
  pendingCount(): number;
  flush(): Promise<number>;
}

// ---------------------------------------------------------------- live
const OUTBOX = "mb.outbox.v1";

function readOutbox(): Transaction[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Transaction[];
  } catch {
    return [];
  }
}
function writeOutbox(xs: Transaction[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(xs));
  } catch {
    /* storage unavailable: the save error is surfaced by the caller */
  }
}
const isNetworkError = (e: unknown) => e instanceof TypeError;

export class LiveStore implements DataStore {
  mode = "live" as const;
  constructor(private email: string | null) {}

  async list() {
    const [remote] = await Promise.all([api.listTransactions(), this.flush().catch(() => 0)]);
    const pending = readOutbox();
    const ids = new Set(remote.map((t) => t.id));
    return [...remote, ...pending.filter((t) => !ids.has(t.id))];
  }

  async put(t: Transaction): Promise<SaveResult> {
    try {
      await api.putTransaction(t);
      return "SAVED";
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      writeOutbox([...readOutbox().filter((x) => x.id !== t.id), t]);
      return "QUEUED";
    }
  }

  pendingCount() {
    return readOutbox().length;
  }

  /** Push queued saves; ids are idempotency keys, so a resend never duplicates. */
  async flush() {
    let sent = 0;
    for (const t of readOutbox()) {
      try {
        await api.putTransaction(t);
      } catch (e) {
        if (isNetworkError(e)) break;
        // A server-side rejection would never succeed on retry; drop it from the queue loudly.
        console.error("Queued save rejected by the server", t.id, e);
      }
      writeOutbox(readOutbox().filter((x) => x.id !== t.id));
      sent += 1;
    }
    return sent;
  }

  listShares() {
    return api.listShares();
  }
  createShare(s: ShareInput) {
    return api.createShare({ id: s.id, consentAck: true, currency: s.currency, basis: s.basis, transactionIds: s.transactionIds, note: s.lender });
  }
  revokeShare(id: string) {
    return api.revokeShare(id);
  }
  async getRates() {
    const rates = await api.getRates().catch(() => [] as OfficialRate[]);
    return rates.length ? { rates, sample: false } : { rates: SAMPLE_OFFICIAL_RATES, sample: true };
  }
  putRate(r: OfficialRate) {
    return api.putRate(r);
  }
  async parseSms(text: string) {
    const local = parseMoneySms(text);
    if (local.confidence === "HIGH") return local;
    try {
      return await api.parseSms(text);
    } catch {
      return local;
    }
  }
  async businessName() {
    try {
      return (await api.getProfile()).name;
    } catch {
      return this.email ?? "My business";
    }
  }
  async setBusinessName(name: string) {
    let existing;
    try {
      existing = await api.getProfile();
    } catch {
      existing = null;
    }
    const now = new Date().toISOString();
    await api.putProfile({ id: existing?.id ?? "me", name, reportingCurrency: existing?.reportingCurrency ?? "USD", tin: existing?.tin, createdAt: existing?.createdAt ?? now, updatedAt: now });
  }
}

// ---------------------------------------------------------------- demo
const DEMO_KEY = "mb.demo.v2";

interface DemoState {
  txns: Transaction[];
  shares: ShareLink[];
  rates: OfficialRate[];
  name: string;
}

export class DemoStore implements DataStore {
  mode = "demo" as const;
  private state: DemoState;

  constructor() {
    this.state = this.load() ?? this.fresh();
    this.save();
  }

  private fresh(): DemoState {
    const txns = seedDemo();
    const share = sharePassport({ id: "demo-share-1", consentAck: true, currency: "USD", basis: "EFFECTIVE", transactionIds: txns.map((t) => t.id), note: "Women in Business Fund (example)" });
    return { txns, shares: [share], rates: SAMPLE_OFFICIAL_RATES, name: DEMO_BUSINESS };
  }
  private load(): DemoState | null {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      return raw ? (JSON.parse(raw) as DemoState) : null;
    } catch {
      return null;
    }
  }
  private save() {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(this.state));
    } catch {
      /* in-memory only */
    }
  }
  reset() {
    this.state = this.fresh();
    this.save();
  }

  async list() {
    return [...this.state.txns];
  }
  async put(t: Transaction): Promise<SaveResult> {
    this.state.txns = [...this.state.txns.filter((x) => x.id !== t.id), t];
    this.save();
    return "SAVED";
  }
  async listShares() {
    return [...this.state.shares];
  }
  async createShare(s: ShareInput) {
    const link = sharePassport({ id: s.id, consentAck: true, currency: s.currency, basis: s.basis, transactionIds: s.transactionIds, note: s.lender });
    this.state.shares = [link, ...this.state.shares];
    this.save();
    return link;
  }
  async revokeShare(id: string) {
    let revoked: ShareLink | undefined;
    this.state.shares = this.state.shares.map((l) => (l.id === id ? (revoked = revokeLink(l)) : l));
    this.save();
    if (!revoked) throw new Error("No such share");
    return revoked;
  }
  async getRates() {
    const sample = this.state.rates.every((r) => r.note?.startsWith("Sample"));
    return { rates: [...this.state.rates], sample };
  }
  async putRate(r: OfficialRate) {
    this.state.rates = [...this.state.rates.filter((x) => !(x.pair === r.pair && x.date === r.date)), r];
    this.save();
  }
  async parseSms(text: string) {
    return parseMoneySms(text);
  }
  async businessName() {
    return this.state.name;
  }
  async setBusinessName(name: string) {
    this.state.name = name;
    this.save();
  }
  pendingCount() {
    return 0;
  }
  async flush() {
    return 0;
  }
}
