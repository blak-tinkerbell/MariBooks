import { useMemo, useState } from "react";
import { getStatement, subtract, sum, translate, type Category, type Currency, type OfficialRateTable, type RateBasis, type Transaction } from "@maribooks/shared";
import type { AppData } from "../App.js";
import { Chevrons, Icon } from "../icons.js";
import { ASSET_LABEL, CAT_LABEL, addDays, fmt, isNeg, longDate, monthRange, todayISO } from "../lib.js";
import { basisLabel, FieldError, Notice, PageHeader, Seg, ViewControls } from "../ui.js";

type Preset = "month" | "last" | "3m" | "ytd" | "custom";

function presetRange(p: Preset, today: string) {
  if (p === "month") return monthRange(today, 0);
  if (p === "last") return monthRange(today, -1);
  if (p === "3m") return { from: monthRange(today, -2).from, to: today };
  if (p === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return null;
}

export function Statement({ data }: { data: AppData }) {
  const { txns, rates, view, ratesSample } = data;
  const { cur, basis } = view;
  const today = todayISO();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: addDays(today, -30), to: today });

  const range = presetRange(preset, today) ?? custom;
  const rangeErr =
    preset !== "custom" ? "" : !custom.from || !custom.to ? "Pick both dates." : custom.from > custom.to ? "The start date must be before the end date." : custom.to > today ? "The end date can't be in the future." : "";

  const s = useMemo(() => {
    if (rangeErr) return null;
    try {
      return getStatement(txns, range, { name: data.businessName }, cur, basis, rates);
    } catch (e) {
      return { error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, range.from, range.to, cur, basis, rates, data.businessName, rangeErr]);

  const scoped = txns.filter((t) => t.date >= range.from && t.date <= range.to);
  const byCur = (["USD", "ZiG", "ZAR"] as const).map((c) => ({ c, n: scoped.filter((t) => t.currency === c).length })).filter((x) => x.n > 0);
  const nf = (v: string) => fmt(v, cur);

  const inRows = s && !("error" in s) ? (Object.entries(s.byCategory) as [Category, { in: string; out: string }][]).filter(([, v]) => Number(v.in) !== 0) : [];
  // Asset purchases are shown below the line, so operating rows exclude them.
  const opRows = s && !("error" in s) ? operatingRows(scoped, s.totals.operatingOut, cur, basis, rates) : [];

  return (
    <>
      <PageHeader title="Statement" sub="A lender-ready statement of comprehensive income built from your records.">
        <ViewControls {...view} />
      </PageHeader>

      <div className="card filters no-print">
        <Seg label="Statement period" value={preset} onChange={setPreset} options={[
          { value: "month", label: "This month" },
          { value: "last", label: "Last month" },
          { value: "3m", label: "Last 3 months" },
          { value: "ytd", label: "Year to date" },
          { value: "custom", label: "Custom" },
        ]} />
        {preset === "custom" && (
          <div className="date-range">
            <div className="field"><label htmlFor="from">From</label><input id="from" type="date" className={`input ${rangeErr ? "invalid" : ""}`} max={today} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-describedby="err-range" /></div>
            <div className="field"><label htmlFor="to">To</label><input id="to" type="date" className={`input ${rangeErr ? "invalid" : ""}`} max={today} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-describedby="err-range" /></div>
            <FieldError id="err-range" msg={rangeErr} />
          </div>
        )}
      </div>

      {s && "error" in s && <Notice tone="error">Couldn't convert some entries: {s.error}. <a href="#/settings">Add an official rate</a>.</Notice>}

      {s && !("error" in s) && (
        <div className="grid-statement">
          <article className="card flush statement print-area">
            <div className="statement-head">
              <Chevrons id="stmtChev" height={52} opacity={0.2} />
              <div className="statement-head-inner">
                <div>
                  <div className="eyebrow gold">Statement of Comprehensive Income</div>
                  <div className="display statement-biz">{s.business.name || "My business"}</div>
                  <div className="dim">{longDate(range.from)} – {longDate(range.to)} · in {cur}</div>
                </div>
                <div className="statement-net">
                  <div className="dim">Net profit</div>
                  <div className="display num">{nf(s.totals.netProfit)}</div>
                </div>
              </div>
            </div>
            <div className="statement-body">
              <table className="table fin">
                <caption>Money in</caption>
                <tbody>
                  {inRows.length === 0 && <tr><th scope="row" className="muted">No money in this period</th><td className="right num">{nf("0")}</td></tr>}
                  {inRows.map(([c, v]) => <tr key={c}><th scope="row">{c === "OTHER" ? "Other income" : CAT_LABEL[c]}</th><td className="right num">{nf(v.in)}</td></tr>)}
                  <tr className="total"><th scope="row">Total money in</th><td className="right num">{nf(s.totals.moneyIn)}</td></tr>
                </tbody>
              </table>
              <table className="table fin">
                <caption>Operating costs (incl. fees & IMTT)</caption>
                <tbody>
                  {opRows.length === 0 && <tr><th scope="row" className="muted">No operating costs this period</th><td className="right num">{nf("0")}</td></tr>}
                  {opRows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td className="right num">{nf(r.value)}</td></tr>)}
                  <tr className="total"><th scope="row">Total operating costs</th><td className="right num">{nf(s.totals.operatingOut)}</td></tr>
                </tbody>
              </table>
              <div className={`net-band ${isNeg(s.totals.netProfit) ? "neg" : ""}`}>
                <div>
                  <div className="strong">Net profit</div>
                  <div className="muted">{Number(s.totals.moneyIn) > 0 ? `Margin ${((Number(s.totals.netProfit) / Number(s.totals.moneyIn)) * 100).toFixed(1)}% of money in` : "No money in this period"}</div>
                </div>
                <span className="display num">{nf(s.totals.netProfit)}</span>
              </div>
              <table className="table fin">
                <caption>Capital expenditure (APEX) · below the line, not in profit</caption>
                <tbody>
                  {Object.keys(s.assetsAcquired).length === 0 && <tr><th scope="row" className="muted">No capital expenditure this period</th><td className="right num">{nf("0")}</td></tr>}
                  {Object.entries(s.assetsAcquired).map(([k, v]) => (
                    <tr key={k}><th scope="row">APEX · {ASSET_LABEL[k as keyof typeof ASSET_LABEL]} ({v.count})</th><td className="right num">{nf(v.value)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="footnote">
                <Icon name="info" size={18} />
                <span>
                  Translated to {cur} at {basisLabel(basis).toLowerCase()}
                  {basis === "OFFICIAL" && ratesSample ? " (sample reference rates — replace them in Rates & settings)" : ""}.
                  {byCur.length > 0 && <> Original entries: {byCur.map((x) => `${x.n} in ${x.c}`).join(", ")}.</>}
                  {s.note && <> {s.note}</>} Generated {longDate(s.generatedAt)} by MariBooks.
                </span>
              </p>
            </div>
          </article>

          <aside className="stack no-print">
            <div className="card stack-sm">
              <h2>Share or download</h2>
              <p className="muted">Send it to a lender, or keep a copy for your records.</p>
              <button type="button" className="btn primary block" onClick={() => window.print()}><Icon name="download" />Download PDF</button>
              <a href="#/passport" className="btn ghost block"><Icon name="share" />Share with a lender</a>
              <p className="fine">"Download PDF" opens your browser's print dialog. Choose "Save as PDF".</p>
            </div>
            <div className="card stack-sm">
              <h2>Record checks</h2>
              <ul className="checklist">
                <Check ok={scoped.length > 0} text={`${scoped.length} entries in this period`} />
                <Check ok={scoped.filter((t) => t.currency !== "USD").every((t) => !!t.effectiveRate)} text="Every ZiG/ZAR entry has a market rate" />
                <Check ok={scoped.every((t) => !t.isAsset || !!t.assetClass)} text="Capital expenditure is classified" />
                <Check ok={scoped.some((t) => t.proof)} text={`${scoped.filter((t) => t.proof).length} entries backed by an invoice or receipt`} />
              </ul>
            </div>
            {scoped.some((t) => t.proof) && (
              <div className="card stack-sm">
                <h2>Proof of transactions</h2>
                <p className="muted">Invoices and receipts attached to this period's records. A lender can open each one.</p>
                <ul className="proof-list">
                  {scoped.filter((t) => t.proof).slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <button type="button" className="link-btn" onClick={() => openProof(data, t.proof!.key)}>
                        <Icon name="message" size={16} /> {t.proof!.kind === "INVOICE" ? "Invoice" : "Receipt"} · {t.note || CAT_LABEL[t.category]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <li className={ok ? "ok" : "todo"}><Icon name={ok ? "check" : "alert"} size={18} stroke={2.2} />{text}</li>;
}

/** Resolve a short-lived URL for a proof file and open it in a new tab. */
async function openProof(data: AppData, key: string) {
  try {
    const url = await data.store.proofViewUrl(key);
    if (url) window.open(url, "_blank", "noopener");
  } catch {
    /* viewing proof is best-effort; a failure is non-fatal */
  }
}

/**
 * Operating costs by category (principal, non-asset money out), plus one "Bank fees & IMTT"
 * line. The fee line is the engine's total minus the category rows, so the table always adds
 * up exactly to the statement total.
 */
function operatingRows(scoped: Transaction[], total: string, cur: Currency, basis: RateBasis, rates: OfficialRateTable) {
  const by = new Map<Category, string[]>();
  for (const t of scoped) {
    if (t.direction !== "OUT" || t.isAsset) continue;
    by.set(t.category, [...(by.get(t.category) ?? []), translate(t, cur, basis, rates).value]);
  }
  const rows = [...by.entries()].map(([c, vs]) => ({ label: c === "OTHER" ? "Other expenses" : CAT_LABEL[c], value: sum(vs) }));
  const charges = subtract(total, sum(rows.map((r) => r.value)));
  if (Number(charges) !== 0) rows.push({ label: "Bank fees & IMTT on payments", value: charges });
  return rows;
}
