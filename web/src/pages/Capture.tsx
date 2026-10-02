import { useMemo, useState, type FormEvent } from "react";
import {
  ASSET_CLASSES,
  CURRENCIES,
  RAILS,
  buildTransaction,
  type AssetClass,
  type Category,
  type Currency,
  type Direction,
  type Rail,
  type SmsDraft,
} from "@maribooks/shared";
import type { AppData } from "../App.js";
import { UnauthorizedError } from "../api.js";
import { Chevrons, Icon } from "../icons.js";
import {
  ASSET_LABEL,
  BASE,
  CAT_LABEL,
  IN_CATEGORIES,
  OUT_CATEGORIES,
  RAIL_LABEL,
  addDays,
  feeFromPct,
  fmt,
  latestStreetRates,
  pctFromFee,
  perUsdToRate,
  todayISO,
} from "../lib.js";
import { FieldError, Notice, PageHeader } from "../ui.js";

const MONEY = /^\d+(\.\d{1,2})?$/;
const PCT = /^\d+(\.\d{1,2})?$/;
const RATE = /^\d+(\.\d{1,4})?$/;
const NOTE_MAX = 80;

interface Form {
  direction: Direction;
  amount: string;
  currency: Currency;
  rail: Rail;
  category: Category;
  feePct: string;
  imttPct: string;
  street: string; // "1 USD = street <currency>"
  date: string;
  note: string;
  isAsset: boolean;
  assetClass: AssetClass | "";
}

type Field = "amount" | "feePct" | "imttPct" | "street" | "date" | "note" | "assetClass";

const clean = (s: string) => s.replace(/,/g, "").trim();

export function Capture({ data }: { data: AppData }) {
  const today = todayISO();
  const streets = useMemo(() => latestStreetRates(data.txns), [data.txns]);
  const officialPerUsd = (c: Currency) => {
    const r = data.rates.getRateForDate(`USD/${c}` as "USD/ZiG" | "USD/ZAR", today);
    return r ? Number(r.rate).toFixed(2) : "";
  };
  const suggestStreet = (c: Currency) => (c === BASE ? "" : streets[c]?.perUsd ?? officialPerUsd(c));

  const blank = (direction: Direction = "IN"): Form => ({
    direction,
    amount: "",
    currency: BASE,
    rail: "ECOCASH",
    category: direction === "IN" ? "SALES" : "STOCK",
    feePct: "",
    imttPct: "",
    street: "",
    date: today,
    note: "",
    isAsset: false,
    assetClass: "",
  });

  const [f, setF] = useState<Form>(blank());
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sms, setSms] = useState("");
  const [smsResult, setSmsResult] = useState<SmsDraft | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);

  const set = (patch: Partial<Form>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setStatus(null);
  };
  const blur = (k: Field) => () => setTouched((t) => ({ ...t, [k]: true }));

  // ---------------- validation
  const errors: Partial<Record<Field, string>> = {};
  const amt = clean(f.amount);
  if (!amt) errors.amount = "Enter an amount.";
  else if (!MONEY.test(amt)) errors.amount = "Use numbers only, with up to 2 decimals.";
  else if (Number(amt) <= 0) errors.amount = "Amount must be more than 0.";
  else if (Number(amt) > 10_000_000) errors.amount = "That looks too large. Check the amount.";

  for (const k of ["feePct", "imttPct"] as const) {
    const v = f[k].trim();
    if (!v) continue;
    if (!PCT.test(v)) errors[k] = "Enter a percentage, e.g. 2 or 1.5.";
    else if (Number(v) > 100) errors[k] = "A percentage can't be more than 100.";
    else if (Number(v) > 20) errors[k] = "That's unusually high for a fee. Check it (max 20%).";
  }

  if (f.currency !== BASE) {
    const s = f.street.trim();
    if (!s) errors.street = `Enter the rate you got: how many ${f.currency} for 1 USD.`;
    else if (!RATE.test(s) || Number(s) <= 0) errors.street = "The rate must be a number above 0.";
  }

  if (!f.date) errors.date = "Pick a date.";
  else if (f.date > today) errors.date = "The date can't be in the future.";
  else if (f.date < addDays(today, -730)) errors.date = "That's more than 2 years ago. Check the date.";

  if (f.note.length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
  if (f.isAsset && !f.assetClass) errors.assetClass = "Choose what kind of asset this is.";
  if (f.isAsset && !f.note.trim()) errors.note = "Describe the asset, e.g. \"display fridge\".";

  const show = (k: Field) => (submitted || touched[k] ? errors[k] : undefined);
  const invalid = Object.keys(errors).length > 0;

  // ---------------- derived preview
  const validAmt = !errors.amount ? amt : "0";
  const fee = !errors.feePct ? feeFromPct(validAmt, f.feePct) : undefined;
  const imtt = !errors.imttPct ? feeFromPct(validAmt, f.imttPct) : undefined;
  const inUsd = f.currency === BASE ? validAmt : !errors.street && Number(f.street) > 0 ? (Number(validAmt) / Number(f.street)).toFixed(2) : "";
  const electronic = f.rail !== "CASH";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (invalid) {
      setStatus({ tone: "error", text: "Fix the highlighted fields to save." });
      return;
    }
    setBusy(true);
    try {
      const txn = buildTransaction({
        id: crypto.randomUUID(),
        direction: f.direction,
        amount: Number(amt).toFixed(2),
        currency: f.currency,
        rail: f.rail,
        category: f.category,
        date: f.date,
        fee,
        imtt,
        note: f.note.trim() || undefined,
        effectiveRate: f.currency !== BASE ? { toCurrency: BASE, rate: perUsdToRate(f.street) } : undefined,
        isAsset: f.direction === "OUT" ? f.isAsset : undefined,
        assetClass: f.direction === "OUT" && f.isAsset && f.assetClass ? f.assetClass : undefined,
        assetDescription: f.isAsset ? f.note.trim() : undefined,
      });
      const result = await data.store.put(txn);
      const line = `${f.direction === "IN" ? "+" : "−"}${fmt(txn.amount, txn.currency)} · ${RAIL_LABEL[txn.rail]} · ${f.isAsset ? "Asset" : CAT_LABEL[txn.category]}`;
      setStatus(
        result === "QUEUED"
          ? { tone: "warn", text: `Saved on this device: ${line}. It will sync when you're back online.` }
          : { tone: "ok", text: `Saved: ${line}` },
      );
      // Keep the owner's context (direction, currency, rail, rate) for fast repeat entry.
      setF((prev) => ({ ...blank(prev.direction), currency: prev.currency, rail: prev.rail, category: prev.category, street: prev.street, date: prev.date }));
      setTouched({});
      setSubmitted(false);
      setSms("");
      setSmsResult(null);
      data.reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) return data.onAuthLost();
      setStatus({ tone: "error", text: `Couldn't save: ${(err as Error).message}. Nothing was lost — try again.` });
    } finally {
      setBusy(false);
    }
  }

  async function fillFromSms() {
    if (!sms.trim()) return;
    setSmsBusy(true);
    try {
      const d = await data.store.parseSms(sms);
      setSmsResult(d);
      const direction = d.direction ?? f.direction;
      const currency = d.currency ?? f.currency;
      const amount = d.amount ?? f.amount;
      set({
        direction,
        amount,
        currency,
        rail: d.rail ?? f.rail,
        category: direction !== f.direction ? (direction === "IN" ? "SALES" : "STOCK") : f.category,
        feePct: d.fee && d.amount ? pctFromFee(d.amount, d.fee) : f.feePct,
        imttPct: d.imtt && d.amount ? pctFromFee(d.amount, d.imtt) : f.imttPct,
        street: currency !== BASE ? f.street || suggestStreet(currency) : "",
        date: d.date && d.date <= today ? d.date : f.date,
        note: (f.note || [d.counterparty, d.reference && `ref ${d.reference}`].filter(Boolean).join(" · ")).slice(0, NOTE_MAX),
        isAsset: direction === "OUT" ? f.isAsset : false,
      });
      setTouched({ amount: true });
    } finally {
      setSmsBusy(false);
    }
  }

  const cats = f.direction === "IN" ? IN_CATEGORIES : OUT_CATEGORIES;
  const catLabel = (c: Category) => (c === "OTHER" ? (f.direction === "IN" ? "Other income" : "Other expense") : CAT_LABEL[c]);

  return (
    <>
      <PageHeader title="Record money" sub="Every amount stays in the currency it happened in." />

      {status && <Notice tone={status.tone}>{status.text}{status.tone === "ok" && <> <a href="#/dashboard">View dashboard</a></>}</Notice>}

      <div className="grid-capture">
        <form className="card form-card" onSubmit={submit} noValidate>
          <div role="group" aria-label="Money direction" className="dir-toggle">
            <button type="button" aria-pressed={f.direction === "IN"} className={f.direction === "IN" ? "in on" : "in"} onClick={() => set({ direction: "IN", category: "SALES", isAsset: false, assetClass: "" })}>
              <Icon name="up" stroke={2.4} />Money in
            </button>
            <button type="button" aria-pressed={f.direction === "OUT"} className={f.direction === "OUT" ? "out on" : "out"} onClick={() => set({ direction: "OUT", category: "STOCK" })}>
              <Icon name="down" stroke={2.4} />Money out
            </button>
          </div>

          <div className="field">
            <label htmlFor="amount">Amount <span className="req" aria-hidden="true">*</span></label>
            <div className={`amount-box ${show("amount") ? "invalid" : ""}`}>
              <span className="display">{f.currency === "USD" ? "US$" : f.currency === "ZAR" ? "R" : "ZiG"}</span>
              <input id="amount" className="display num" inputMode="decimal" autoComplete="off" placeholder="0.00" value={f.amount} onChange={(e) => set({ amount: e.target.value })} onBlur={blur("amount")} aria-invalid={!!show("amount")} aria-describedby="err-amount" />
            </div>
            <FieldError id="err-amount" msg={show("amount")} />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" className="input" value={f.currency} onChange={(e) => { const c = e.target.value as Currency; set({ currency: c, street: suggestStreet(c) }); }}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c === "USD" ? "USD · US dollar" : c === "ZiG" ? "ZiG · Zimbabwe Gold" : "ZAR · SA rand"}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rail">Paid via</label>
              <select id="rail" className="input" value={f.rail} onChange={(e) => set({ rail: e.target.value as Rail })}>
                {RAILS.map((r) => <option key={r} value={r}>{RAIL_LABEL[r]}</option>)}
              </select>
            </div>

            {f.currency !== BASE && (
              <div className="field span-2">
                <label htmlFor="street">Market rate you got <span className="req" aria-hidden="true">*</span></label>
                <div className={`input-wrap ${show("street") ? "invalid" : ""}`}>
                  <span className="affix">1 USD =</span>
                  <input id="street" className="num" inputMode="decimal" value={f.street} onChange={(e) => set({ street: e.target.value })} onBlur={blur("street")} aria-invalid={!!show("street")} aria-describedby="street-help err-street" />
                  <span className="affix">{f.currency}</span>
                </div>
                <span id="street-help" className="help">
                  {streets[f.currency] ? `Prefilled with your last rate (${longish(streets[f.currency]!.date)}).` : "The rate you actually traded at. Official rates are kept separately for reports."}
                </span>
                <FieldError id="err-street" msg={show("street")} />
              </div>
            )}

            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" className="input" value={f.category} onChange={(e) => set({ category: e.target.value as Category })}>
                {cats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" className={`input ${show("date") ? "invalid" : ""}`} max={today} value={f.date} onChange={(e) => set({ date: e.target.value })} onBlur={blur("date")} aria-invalid={!!show("date")} aria-describedby="err-date" />
              <FieldError id="err-date" msg={show("date")} />
            </div>

            <div className="field">
              <label htmlFor="feePct">Rail fee <span className="opt">(optional)</span></label>
              <div className={`input-wrap ${show("feePct") ? "invalid" : ""}`}>
                <input id="feePct" className="num" inputMode="decimal" placeholder="e.g. 1" value={f.feePct} onChange={(e) => set({ feePct: e.target.value })} onBlur={blur("feePct")} aria-invalid={!!show("feePct")} aria-describedby="fee-help err-feePct" />
                <span className="affix strong">%</span>
              </div>
              <span id="fee-help" className="help">{fee ? `= ${fmt(fee, f.currency)} charged by ${RAIL_LABEL[f.rail]}` : "Charged by the bank or mobile wallet."}</span>
              <FieldError id="err-feePct" msg={show("feePct")} />
            </div>
            <div className="field">
              <label htmlFor="imttPct">IMTT <span className="opt">(optional)</span></label>
              <div className={`input-wrap ${show("imttPct") ? "invalid" : ""}`}>
                <input id="imttPct" className="num" inputMode="decimal" placeholder="e.g. 2" value={f.imttPct} onChange={(e) => set({ imttPct: e.target.value })} onBlur={blur("imttPct")} aria-invalid={!!show("imttPct")} aria-describedby="imtt-help err-imttPct" />
                <span className="affix strong">%</span>
              </div>
              <span id="imtt-help" className="help">
                {imtt ? `= ${fmt(imtt, f.currency)} transfer tax, kept separate` : electronic && f.direction === "OUT" ? (
                  <button type="button" className="link-btn" onClick={() => set({ imttPct: "2" })}>Add the usual 2% IMTT</button>
                ) : "Tax on electronic transfers."}
              </span>
              <FieldError id="err-imttPct" msg={show("imttPct")} />
            </div>
          </div>

          {f.direction === "OUT" && (
            <div className="asset-box">
              <label className="check-row">
                <input type="checkbox" checked={f.isAsset} onChange={(e) => set({ isAsset: e.target.checked, category: e.target.checked ? "OTHER" : f.category })} />
                <span>
                  <strong>This is an asset</strong>
                  <span className="help">Equipment, a fridge, a vehicle. It's kept out of profit and added to your credit passport.</span>
                </span>
              </label>
              {f.isAsset && (
                <div className="field">
                  <label htmlFor="assetClass">Kind of asset <span className="req" aria-hidden="true">*</span></label>
                  <select id="assetClass" className={`input ${show("assetClass") ? "invalid" : ""}`} value={f.assetClass} onChange={(e) => set({ assetClass: e.target.value as AssetClass })} onBlur={blur("assetClass")} aria-invalid={!!show("assetClass")} aria-describedby="err-assetClass">
                    <option value="">Choose…</option>
                    {ASSET_CLASSES.map((a) => <option key={a} value={a}>{ASSET_LABEL[a]}</option>)}
                  </select>
                  <FieldError id="err-assetClass" msg={show("assetClass")} />
                </div>
              )}
            </div>
          )}

          <div className="field">
            <div className="label-row">
              <label htmlFor="note">{f.isAsset ? <>Describe the asset <span className="req" aria-hidden="true">*</span></> : <>Note <span className="opt">(optional)</span></>}</label>
              <span className={`count num ${f.note.length > NOTE_MAX ? "over" : ""}`}>{f.note.length} / {NOTE_MAX}</span>
            </div>
            <input id="note" className={`input ${show("note") ? "invalid" : ""}`} placeholder={f.isAsset ? "e.g. display fridge" : "e.g. bread stock, September rent"} value={f.note} onChange={(e) => set({ note: e.target.value })} onBlur={blur("note")} aria-invalid={!!show("note")} aria-describedby="err-note" />
            <FieldError id="err-note" msg={show("note")} />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn primary lg grow" disabled={busy}>{busy ? "Saving…" : "Save entry"}</button>
            <button type="button" className="btn ghost lg" onClick={() => { setF(blank(f.direction)); setTouched({}); setSubmitted(false); setStatus(null); }}>Clear</button>
          </div>
        </form>

        <aside className="stack">
          <div className="card sms-card">
            <div className="card-head"><h2><Icon name="message" /> Paste a payment SMS</h2></div>
            <p className="muted">Got an EcoCash, InnBucks or bank confirmation? Paste it and we'll fill in the form. Check it before you save.</p>
            <label htmlFor="sms" className="sr-only">Payment SMS</label>
            <textarea id="sms" className="input textarea" rows={4} maxLength={800} placeholder="e.g. You have received USD 25.00 from T. Moyo…" value={sms} onChange={(e) => setSms(e.target.value)} />
            <button type="button" className="btn secondary block" disabled={!sms.trim() || smsBusy} onClick={fillFromSms}>
              <Icon name="sparkle" />{smsBusy ? "Reading…" : "Fill the form"}
            </button>
            {smsResult && (
              <p className={`sms-result ${smsResult.confidence.toLowerCase()}`} role="status">
                {smsResult.confidence === "HIGH" ? "Read the amount, currency and direction." : smsResult.confidence === "MEDIUM" ? "Read most of it. Check the highlighted fields." : "Couldn't read this one. Please fill the form by hand."}
                {smsResult.source === "AI" && <span className="pill">AI-assisted · Amazon Bedrock</span>}
              </p>
            )}
          </div>

          <div className="preview">
            <Chevrons id="prevChev" height={56} opacity={0.2} />
            <div className="preview-inner">
              <span className="eyebrow gold">You're recording</span>
              <span className="display num preview-amt">{Number(validAmt) > 0 ? `${f.direction === "IN" ? "+" : "−"}${fmt(Number(validAmt).toFixed(2), f.currency)}` : fmt("0", f.currency)}</span>
              <dl>
                <dt>Paid via</dt><dd>{RAIL_LABEL[f.rail]}</dd>
                <dt>Category</dt><dd>{f.isAsset ? "Asset" : catLabel(f.category)}</dd>
                <dt>Fee + IMTT</dt><dd className="num">{fee || imtt ? fmt((Number(fee ?? 0) + Number(imtt ?? 0)).toFixed(2), f.currency) : "None"}</dd>
                {f.currency !== BASE && <><dt>In USD</dt><dd className="num">{inUsd ? fmt(inUsd, "USD") : "—"}</dd></>}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function longish(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
