import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getPassport, type ShareLink } from "@maribooks/shared";
import type { AppData } from "../App.js";
import { UnauthorizedError } from "../api.js";
import { Chevrons, Icon, Logo } from "../icons.js";
import { ASSET_LABEL, fmt, isNeg, longDate, todayISO } from "../lib.js";
import { basisLabel, FieldError, Notice, PageHeader, ViewControls } from "../ui.js";
import { readiness } from "./readiness.js";

const STABILITY: Record<string, { label: string; note: string }> = {
  STRONG: { label: "Steady", note: "Monthly turnover varies little" },
  MODERATE: { label: "Moderate", note: "Some swings month to month" },
  VARIABLE: { label: "Variable", note: "Large swings, or under 2 months of data" },
};

export function Passport({ data }: { data: AppData }) {
  const { txns, rates, view, store } = data;
  const { cur, basis } = view;
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [lender, setLender] = useState("");
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    store.listShares().then(setShares).catch(() => setShares([]));
  }, [store]);

  const p = useMemo(() => {
    try {
      return getPassport(txns, cur, basis, rates);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [txns, cur, basis, rates]);

  if ("error" in p) {
    return (
      <>
        <PageHeader title="Credit passport" sub="Your record, ready for lenders."><ViewControls {...view} /></PageHeader>
        <Notice tone="error">Couldn't convert some entries: {p.error}. <a href="#/settings">Add an official rate</a>.</Notice>
      </>
    );
  }

  const ready = readiness(txns, p);
  const stab = STABILITY[p.cashFlowStability] ?? STABILITY.VARIABLE!;
  const lenderErr = lender.trim().length < 2 ? "Enter who you're sharing with (2+ characters)." : lender.trim().length > 60 ? "Keep the name under 60 characters." : "";
  const consentErr = consent ? "" : "Tick the box to confirm you agree to share.";
  const assetsByClass = Object.entries(p.declaredAssetBase.byClass);

  // Average turnover is over the full span, counting quiet months; say so plainly.
  const avgNote = p.monthsInPeriod <= 1
    ? "Over 1 month"
    : p.hasContinuousMonths
      ? `Over ${p.monthsInPeriod} months`
      : `Over ${p.monthsInPeriod} months (${p.activeMonths} with sales)`;

  // "Record span" is first-to-last, not a continuity guarantee — be honest about which it is.
  const spanNote = p.recordSpanDays >= 90
    ? p.hasContinuousMonths
      ? "Entries in every month — lenders look for 3+"
      : "First to last entry; some months have no sales"
    : `${Math.max(0, 90 - p.recordSpanDays)} days to 3 months`;

  // Net profit tone + plain note; money-out is operating costs only (assets shown separately).
  const profitTone = isNeg(p.netProfit) ? "warn" : "good";
  const profitNote = isNeg(p.netProfit)
    ? "Spent more than earned over the period"
    : "Money-in less operating costs (assets excluded)";

  const assetClassList = assetsByClass.map(([k]) => ASSET_LABEL[k as keyof typeof ASSET_LABEL].split(" (")[0]).join(", ");
  const assetSpan = p.assetsAcquiredFrom && p.assetsAcquiredTo
    ? p.assetsAcquiredFrom === p.assetsAcquiredTo
      ? `${assetClassList} · acquired ${longDate(p.assetsAcquiredFrom)}`
      : `${assetClassList} · ${longDate(p.assetsAcquiredFrom)} – ${longDate(p.assetsAcquiredTo)}`
    : null;

  async function create(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setMsg(null);
    if (lenderErr || consentErr) return;
    setBusy(true);
    try {
      const link = await store.createShare({ id: crypto.randomUUID(), lender: lender.trim(), currency: cur, basis, transactionIds: txns.map((t) => t.id) });
      setShares((s) => [link, ...s]);
      setLender("");
      setConsent(false);
      setTried(false);
      setMsg({ tone: "ok", text: `Shared with ${link.note}. Entries in this passport are now locked from edits until you revoke.` });
    } catch (err) {
      if (err instanceof UnauthorizedError) return data.onAuthLost();
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      const r = await store.revokeShare(id);
      setShares((s) => s.map((x) => (x.id === id ? r : x)));
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader title="Credit passport" sub="Your record, ready for lenders. Shared only when you say so.">
        <ViewControls {...view} />
      </PageHeader>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="grid-passport print-area">
        <div className="passport-doc">
          <Chevrons id="passChev" height={64} opacity={0.22} />
          <svg className="passport-seal" aria-hidden="true" width="200" height="200" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r="96" fill="none" stroke="#E0A43A" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="3 7" />
            <circle cx="110" cy="110" r="74" fill="none" stroke="#E0A43A" strokeOpacity="0.35" strokeWidth="2" />
          </svg>
          <div className="passport-inner">
            <div className="passport-brand"><Logo size={30} /><span className="eyebrow gold">MariBooks credit passport</span></div>
            <div>
              <div className="display passport-name">{data.businessName || "My business"}</div>
              <div className="dim">{p.periodCovered ? `Records from ${longDate(p.periodCovered.from)} to ${longDate(p.periodCovered.to)}` : "No income recorded yet"}</div>
            </div>
            <div className="passport-meta">
              <div><div className="dim sm">Generated</div><div className="strong">{longDate(todayISO())}</div></div>
              <div><div className="dim sm">Basis</div><div className="strong">{basisLabel(basis)}</div></div>
              <div><div className="dim sm">Readiness</div><div className="strong gold-text">{ready.done} of {ready.items.length} ready</div></div>
            </div>
          </div>
        </div>
        <div className="grid-2">
          <Metric label="Avg monthly turnover" value={fmt(p.avgMonthlyTurnover, cur)} note={avgNote} />
          <Metric label="Net profit" value={fmt(p.netProfit, cur)} note={profitNote} tone={profitTone} />
          <Metric label="Money out (operating)" value={fmt(p.totalMoneyOut, cur)} note="Operating costs, fees & IMTT — assets excluded" />
          <Metric label="Cash-flow stability" value={stab.label} note={stab.note} tone={p.cashFlowStability === "STRONG" ? "good" : "warn"} />
          <Metric label="Record span" value={`${p.recordSpanDays} days`} note={spanNote} tone={p.recordSpanDays >= 90 ? "good" : "warn"} />
          <Metric label="Declared assets" value={fmt(p.declaredAssetBase.total, cur)} note={assetSpan ?? "None declared yet"} />
        </div>
      </section>
      <p className="fine">Turnover is the total of money-in you recorded; net profit is turnover less operating costs, fees and IMTT. Record span is the time from your first to your latest entry, not a guarantee of unbroken records. Assets are your declared purchase cost, not a valuation.</p>

      <section className="grid-passport no-print">
        <div className="card flush">
          <div className="pad">
            <h2>Who can see your passport</h2>
            <p className="muted">Revoke a share any time. Entries in an active share can't be edited, so a lender always sees what you sent.</p>
          </div>
          {shares.length === 0 && <p className="muted pad">You haven't shared your passport yet.</p>}
          {shares.map((s) => (
            <div key={s.id} className="share-row">
              <span className="share-icon"><Icon name="lock" /></span>
              <div className="grow">
                <div className="strong">{s.note || "Lender"}</div>
                <div className="muted">Shared {longDate(s.createdAt)}{s.revokedAt ? ` · revoked ${longDate(s.revokedAt)}` : ""} · {s.currency}, {basisLabel(s.basis).toLowerCase()}</div>
              </div>
              <span className={`pill ${s.revokedAt ? "" : "active"}`}>{s.revokedAt ? "Revoked" : "Active"}</span>
              {!s.revokedAt && <button type="button" className="btn danger sm" onClick={() => revoke(s.id)}>Revoke</button>}
            </div>
          ))}
        </div>

        <form className="card stack-sm" onSubmit={create} noValidate>
          <h2>Share with a lender</h2>
          <div className="field">
            <label htmlFor="lender">Lender or person <span className="req" aria-hidden="true">*</span></label>
            <input id="lender" className={`input ${tried && lenderErr ? "invalid" : ""}`} placeholder="e.g. your bank or microfinance" value={lender} onChange={(e) => setLender(e.target.value)} aria-invalid={tried && !!lenderErr} aria-describedby="err-lender" />
            <FieldError id="err-lender" msg={tried ? lenderErr : ""} />
          </div>
          <label className={`check-row consent ${tried && consentErr ? "invalid" : ""}`}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-describedby="err-consent" />
            <span>I agree to share this passport ({cur}, {basisLabel(basis).toLowerCase()}) with the lender named above. I can revoke it at any time.</span>
          </label>
          <FieldError id="err-consent" msg={tried ? consentErr : ""} />
          <button type="submit" className="btn primary block" disabled={busy}><Icon name="share" />{busy ? "Sharing…" : "Share passport"}</button>
          <button type="button" className="btn ghost block" onClick={() => window.print()}><Icon name="download" />Download as PDF</button>
        </form>
      </section>
    </>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warn" }) {
  return (
    <div className="card metric">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value num">{value}</span>
      <span className={`sm ${tone === "good" ? "in-text strong" : tone === "warn" ? "warn-text strong" : "muted"}`}>{note}</span>
    </div>
  );
}
