import { useEffect, useMemo, useState } from "react";
import {
  ASSET_CLASSES,
  CATEGORIES,
  CURRENCIES,
  RAILS,
  buildTransaction,
  formatMoney,
  getDashboard,
  getPassport,
  getStatement,
  OfficialRateTable,
  type AssetClass,
  type Category,
  type Currency,
  type Direction,
  type Rail,
  type RateBasis,
  type Transaction,
} from "@maribooks/shared";
import { api, UnauthorizedError, type SaveState } from "./api.js";
import {
  confirmSignUp,
  currentEmail,
  getIdToken,
  signIn,
  signOut,
  signUp,
} from "./auth.js";

type Tab = "capture" | "dashboard" | "statement" | "passport";
const uuid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getIdToken().then((t) => setAuthed(!!t));
  }, []);

  if (authed === null) return <div className="center app">Loading…</div>;
  if (!authed) return <Auth onDone={() => setAuthed(true)} />;
  return <Main onSignOut={() => { signOut(); setAuthed(false); }} />;
}

// ---------------- Auth ----------------
function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"in" | "up" | "confirm">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="app center">
      <div className="brand" style={{ fontSize: 28, marginBottom: 4 }}>MariBooks</div>
      <div className="muted" style={{ marginBottom: 20 }}>
        Honest books in any currency. Your track record, ready to borrow against.
      </div>
      <div className="card">
        {mode === "confirm" ? (
          <>
            <h2>Confirm your email</h2>
            <label>Verification code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
            <div style={{ height: 12 }} />
            <button disabled={busy} onClick={() => run(async () => { await confirmSignUp(email, code); await signIn(email, password); onDone(); })}>
              Confirm & sign in
            </button>
          </>
        ) : (
          <>
            <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
            <div style={{ height: 12 }} />
            {mode === "in" ? (
              <button disabled={busy} onClick={() => run(async () => { await signIn(email, password); onDone(); })}>Sign in</button>
            ) : (
              <button disabled={busy} onClick={() => run(async () => { await signUp(email, password); setMode("confirm"); })}>Create account</button>
            )}
          </>
        )}
        {err && <div className="error">{err}</div>}
        {mode !== "confirm" && (
          <button className="ghost" style={{ marginTop: 12 }} onClick={() => { setErr(""); setMode(mode === "in" ? "up" : "in"); }}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        )}
      </div>
      <div className="note">Password: 10+ chars with upper, lower, number and symbol.</div>
    </div>
  );
}

// ---------------- Main (authenticated) ----------------
function Main({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("capture");
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [reporting, setReporting] = useState<Currency>("USD");
  const [basis, setBasis] = useState<RateBasis>("EFFECTIVE");
  const [loadErr, setLoadErr] = useState("");

  const rates = useMemo(() => new OfficialRateTable(), []);

  async function reload() {
    try { setTxns(await api.listTransactions()); }
    catch (e) {
      if (e instanceof UnauthorizedError) return onSignOut();
      setLoadErr((e as Error).message);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">MariBooks<span>{currentEmail()}</span></div>
        <button className="ghost" onClick={onSignOut}>Sign out</button>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        {CURRENCIES.map((c) => (
          <button key={c} className={reporting === c ? "on" : ""} onClick={() => setReporting(c)}>{c}</button>
        ))}
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={basis === "EFFECTIVE" ? "on" : ""} onClick={() => setBasis("EFFECTIVE")}>Effective (street)</button>
        <button className={basis === "OFFICIAL" ? "on" : ""} onClick={() => setBasis("OFFICIAL")}>Official</button>
      </div>

      {loadErr && <div className="status failed">{loadErr}</div>}

      {tab === "capture" && <Capture reporting={reporting} onSaved={reload} onAuthLost={onSignOut} />}
      {tab === "dashboard" && <Dashboard txns={txns} reporting={reporting} basis={basis} rates={rates} />}
      {tab === "statement" && <Statement txns={txns} reporting={reporting} basis={basis} rates={rates} />}
      {tab === "passport" && <Passport txns={txns} reporting={reporting} basis={basis} rates={rates} />}

      <div className="tabbar">
        {(["capture", "dashboard", "statement", "passport"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Capture ----------------
function Capture({ reporting, onSaved, onAuthLost }: { reporting: Currency; onSaved: () => void; onAuthLost: () => void; }) {
  const [direction, setDirection] = useState<Direction>("IN");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(reporting);
  const [rail, setRail] = useState<Rail>("ECOCASH");
  const [category, setCategory] = useState<Category>("SALES");
  const [fee, setFee] = useState("");
  const [effRate, setEffRate] = useState("");
  const [isAsset, setIsAsset] = useState(false);
  const [assetClass, setAssetClass] = useState<AssetClass>("EQUIPMENT");
  const [note, setNote] = useState("");
  const [state, setState] = useState<SaveState | null>(null);
  const [err, setErr] = useState("");

  const crossCurrency = currency !== reporting;

  async function save() {
    setErr(""); setState("SAVING");
    try {
      const txn = buildTransaction({
        id: uuid(),
        direction,
        amount,
        currency,
        rail,
        category,
        date: today(),
        fee: fee || undefined,
        note: note || undefined,
        effectiveRate: crossCurrency && effRate ? { toCurrency: reporting, rate: effRate } : undefined,
        isAsset: direction === "OUT" ? isAsset : undefined,
        assetClass: direction === "OUT" && isAsset ? assetClass : undefined,
        assetDescription: isAsset ? note || undefined : undefined,
      });
      await api.putTransaction(txn);
      setState("SAVED");
      setAmount(""); setFee(""); setEffRate(""); setNote(""); setIsAsset(false);
      onSaved();
      setTimeout(() => setState(null), 1500);
    } catch (e) {
      if (e instanceof UnauthorizedError) return onAuthLost();
      setState("FAILED"); setErr((e as Error).message);
    }
  }

  return (
    <div className="card">
      <h2>Record money</h2>
      {state && <div className={`status ${state.toLowerCase()}`}>{state === "SAVING" ? "Saving…" : state === "SAVED" ? "Saved" : "Save failed — try again"}</div>}

      <div className="seg">
        <button className={direction === "IN" ? "on" : ""} onClick={() => setDirection("IN")}>Money in</button>
        <button className={direction === "OUT" ? "on" : ""} onClick={() => setDirection("OUT")}>Money out</button>
      </div>

      <label>Amount</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />

      <div className="row">
        <div>
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Paid via</label>
          <select value={rail} onChange={(e) => setRail(e.target.value as Rail)}>
            {RAILS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div>
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Fee / IMTT (optional)</label>
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </div>
      </div>

      {crossCurrency && (
        <>
          <label>Rate you used (1 {currency} = ? {reporting})</label>
          <input value={effRate} onChange={(e) => setEffRate(e.target.value)} inputMode="decimal" placeholder="street rate" />
          <div className="note">Enter the rate you actually transacted at. Leave blank to use the official rate.</div>
        </>
      )}

      {direction === "OUT" && (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={isAsset} onChange={(e) => setIsAsset(e.target.checked)} />
            This purchase is an asset (kept out of profit; builds your asset base)
          </label>
          {isAsset && (
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {ASSET_CLASSES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>
      )}

      <label>Note (optional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. fridge, stock, rent" />

      <div style={{ height: 14 }} />
      <button disabled={state === "SAVING"} onClick={save}>Save</button>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ txns, reporting, basis, rates }: ReportProps) {
  const range = { from: "0000-01-01", to: "9999-12-31" };
  let d;
  try { d = getDashboard(txns, range, reporting, basis, rates); }
  catch (e) { return <div className="card"><div className="error">{(e as Error).message}</div></div>; }

  const profitClass = d.profit.startsWith("-") ? "neg" : "pos";
  return (
    <>
      <div className="card">
        <h2>Are you making money?</h2>
        <div className={`big ${profitClass}`}>{formatMoney(d.profit, reporting)}</div>
        <div className="muted">{d.plainLanguageSummary}</div>
        <div style={{ height: 12 }} />
        <div className="kv"><span className="muted">Money in</span><span>{formatMoney(d.moneyIn, reporting)}</span></div>
        <div className="kv"><span className="muted">Operating out</span><span>{formatMoney(d.operatingOut, reporting)}</span></div>
        <div className="kv"><span className="muted">Asset spend (excluded from profit)</span><span>{formatMoney(d.assetSpend, reporting)}</span></div>
        <div className="pill" style={{ marginTop: 10 }}>{basis === "EFFECTIVE" ? "Your street rate" : "Official rate"}</div>
        {d.note && <div className="note">{d.note}</div>}
      </div>
      <div className="card">
        <h2>Cash by method</h2>
        {Object.keys(d.cashByRail).length === 0 && <div className="muted">No activity yet.</div>}
        {Object.entries(d.cashByRail).map(([rail, val]) => (
          <div key={rail} className="kv"><span>{rail}</span><span>{formatMoney(val, reporting)}</span></div>
        ))}
      </div>
    </>
  );
}

// ---------------- Statement ----------------
function Statement({ txns, reporting, basis, rates }: ReportProps) {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(today());
  const s = useMemo(() => {
    try { return getStatement(txns, { from, to }, { name: "My Business" }, reporting, basis, rates); }
    catch { return null; }
  }, [txns, from, to, reporting, basis, rates]);

  return (
    <div className="card">
      <h2>Lender-ready statement</h2>
      <div className="row">
        <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {!s ? <div className="error">Could not build statement (check rates).</div> : (
        <>
          <div style={{ height: 12 }} />
          <div className="kv"><span className="muted">Money in</span><span>{formatMoney(s.totals.moneyIn, reporting)}</span></div>
          <div className="kv"><span className="muted">Operating out</span><span>{formatMoney(s.totals.operatingOut, reporting)}</span></div>
          <div className="kv"><b>Net profit</b><b>{formatMoney(s.totals.netProfit, reporting)}</b></div>
          <div className="kv"><span className="muted">Assets acquired</span><span>{formatMoney(s.totals.assetSpend, reporting)}</span></div>
          <div className="pill" style={{ marginTop: 10 }}>Basis: {s.basis === "EFFECTIVE" ? "effective (street)" : "official"}</div>
          {s.note && <div className="note">{s.note}</div>}
          <div style={{ height: 14 }} />
          <button className="secondary" onClick={() => window.print()}>Export / print (PDF)</button>
          <div className="note">Use your browser's "Save as PDF" to share with a lender.</div>
        </>
      )}
    </div>
  );
}

// ---------------- Passport ----------------
function Passport({ txns, reporting, basis, rates }: ReportProps) {
  const [consent, setConsent] = useState(false);
  const [share, setShare] = useState<import("@maribooks/shared").ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = useMemo(() => {
    try { return getPassport(txns, reporting, basis, rates); } catch { return null; }
  }, [txns, reporting, basis, rates]);

  // Surface any existing active share for this owner.
  useEffect(() => {
    api.listShares().then((links) => {
      const active = links.find((l) => !l.revokedAt);
      if (active) setShare(active);
    }).catch(() => {});
  }, []);

  if (!p) return <div className="card"><div className="error">Could not build passport.</div></div>;

  async function createShare() {
    setErr(""); setBusy(true);
    try {
      const link = await api.createShare({
        id: uuid(),
        consentAck: consent,
        currency: reporting,
        basis,
        transactionIds: txns.map((t) => t.id),
      });
      setShare(link);
      window.print();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function revoke() {
    if (!share) return;
    setBusy(true);
    try { await api.revokeShare(share.id); setShare(null); setConsent(false); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Your credit passport</h2>
      <div className="kv"><span className="muted">Verified turnover</span><span>{formatMoney(p.totalTurnover, reporting)}</span></div>
      <div className="kv"><span className="muted">Avg monthly turnover</span><span>{formatMoney(p.avgMonthlyTurnover, reporting)}</span></div>
      <div className="kv"><span className="muted">Cash-flow stability</span><span className="pill">{p.cashFlowStability}</span></div>
      <div className="kv"><span className="muted">Continuous records</span><span>{p.continuousRecordDays} days</span></div>
      <div className="kv"><span className="muted">Declared asset base</span><span>{formatMoney(p.declaredAssetBase.total, reporting)}</span></div>
      <div className="note">{p.declaredAssetBase.label}. Generated {p.generatedAt.slice(0, 10)}.</div>

      <div style={{ height: 14 }} />
      {share ? (
        <>
          <div className="status saved">Shared — entries in this passport are locked from edits while shared.</div>
          <button className="secondary" disabled={busy} onClick={() => window.print()}>Re-export PDF</button>
          <button className="ghost" disabled={busy} onClick={revoke}>Revoke share</button>
        </>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I consent to share this passport
          </label>
          <button disabled={!consent || busy} onClick={createShare}>Share (consent + export PDF)</button>
        </>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}

interface ReportProps {
  txns: Transaction[];
  reporting: Currency;
  basis: RateBasis;
  rates: OfficialRateTable;
}
