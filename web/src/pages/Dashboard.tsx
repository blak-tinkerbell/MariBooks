import { useMemo, useState } from "react";
import { add, getDashboard, getPassport, sum, translate, type DateRange, type Transaction } from "@maribooks/shared";
import type { AppData } from "../App.js";
import { Chevrons, Icon } from "../icons.js";
import { addDays, CAT_LABEL, fmt, isNeg, isZero, longDate, monthRange, RAIL_LABEL, sym, todayISO } from "../lib.js";
import { basisLabel, Notice, PageHeader, ViewControls } from "../ui.js";
import { readiness } from "./readiness.js";

type Period = "month" | "last" | "90" | "all";
const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last", label: "Last month" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function ranges(period: Period, today: string): { cur: DateRange; prev?: DateRange; label: string } {
  if (period === "month") return { cur: monthRange(today, 0), prev: monthRange(today, -1), label: "this month" };
  if (period === "last") return { cur: monthRange(today, -1), prev: monthRange(today, -2), label: "last month" };
  if (period === "90") return { cur: { from: addDays(today, -89), to: today }, prev: { from: addDays(today, -179), to: addDays(today, -90) }, label: "in the last 90 days" };
  return { cur: { from: "0000-01-01", to: "9999-12-31" }, label: "since you started" };
}

export function Dashboard({ data }: { data: AppData }) {
  const { txns, rates, view, loaded } = data;
  const { cur, basis } = view;
  const [period, setPeriod] = useState<Period>("month");
  const today = todayISO();

  const model = useMemo(() => {
    try {
      const r = ranges(period, today);
      const d = getDashboard(txns, r.cur, cur, basis, rates);
      const prev = r.prev ? getDashboard(txns, r.prev, cur, basis, rates) : null;
      const scoped = txns.filter((t) => t.date >= r.cur.from && t.date <= r.cur.to);
      const charges = scoped
        .map((t) => add(t.fee ?? "0", t.imtt ?? "0"))
        .map((c, i) => (isZero(c) ? "0" : translate({ ...scoped[i]!, amount: c }, cur, basis, rates).value));
      const months = [-5, -4, -3, -2, -1, 0].map((o) => {
        const m = monthRange(today, o);
        return { label: m.label, profit: getDashboard(txns, m, cur, basis, rates).profit };
      });
      const all = getDashboard(txns, { from: "0000-01-01", to: "9999-12-31" }, cur, basis, rates);
      const passport = getPassport(txns, cur, basis, rates);
      let change: number | null = null;
      if (prev && !isZero(prev.profit) && !isNeg(prev.profit)) {
        change = ((Number(d.profit) - Number(prev.profit)) / Number(prev.profit)) * 100;
      }
      return { d, charges: sum(charges), months, cash: all.cashByRail, passport, change, label: r.label, count: scoped.length, moneyInCount: scoped.filter((t) => t.direction === "IN").length };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [txns, rates, cur, basis, period, today]);

  const header = (
    <PageHeader title="Dashboard" sub={`${longDate(today)} · are you making money?`}>
      <ViewControls {...view} />
      <a href="#/record" className="btn primary hide-sm"><Icon name="plus" size={18} stroke={2.2} />Record money</a>
    </PageHeader>
  );

  if ("error" in model) {
    return (
      <>
        {header}
        <Notice tone="error">
          We couldn't convert some entries: {model.error}. <a href="#/settings">Add an official rate</a> or switch to your market rate.
        </Notice>
      </>
    );
  }

  if (loaded && txns.length === 0) return <>{header}<EmptyState /></>;

  const { d, months, passport } = model;
  const profitNeg = isNeg(d.profit);
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(Number(m.profit))));
  const cashRows = Object.entries(model.cash).sort((a, b) => Number(b[1]) - Number(a[1]));
  const cashMax = Math.max(1, ...cashRows.map(([, v]) => Math.abs(Number(v))));
  const ready = readiness(txns, passport);
  const recent = [...txns].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1)).slice(0, 6);
  const nf = (v: string) => fmt(v, cur);

  return (
    <>
      {header}
      <section className="grid-3">
        <div className="hero span-2">
          <Chevrons id="heroChev" color="#FFFFFF" opacity={0.13} />
          <svg className="hero-rings" aria-hidden="true" width="260" height="260" viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="120" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="2" />
            <circle cx="130" cy="130" r="80" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="2" />
            <circle cx="130" cy="130" r="40" fill="#E0A43A" fillOpacity="0.22" />
          </svg>
          <div className="hero-inner">
            <div className="hero-top">
              <span className="hero-q">Are you making money?</span>
              <label className="hero-period">
                Period
                <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                  {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
            </div>
            <div className="hero-value">
              <span className="num">{nf(d.profit)}</span>
              {model.change !== null && (
                <span className={`trend ${model.change < 0 ? "down" : ""}`}>
                  <Icon name={model.change < 0 ? "down" : "up"} size={15} stroke={2.4} />
                  {Math.abs(model.change).toFixed(1)}% vs previous
                </span>
              )}
            </div>
            <p className="hero-answer">
              {profitNeg
                ? `Not yet. You spent ${nf(d.profit.slice(1))} more than you took in ${model.label}.`
                : isZero(d.profit)
                  ? `You broke even ${model.label}.`
                  : `Yes. That's your profit ${model.label}, after operating costs and fees.`}
            </p>
            <div className="hero-pills">
              <span>{basisLabel(basis)}</span>
              <span>{model.count} entries</span>
            </div>
          </div>
        </div>

        <a href="#/passport" className="card ready-card">
          <div className="card-head"><h2>Credit readiness</h2><Icon name="arrow" /></div>
          <div className="ready-score"><span className="display">{ready.done} of {ready.items.length}</span><span className="muted">ready for lenders</span></div>
          <div className="ready-bar" aria-hidden="true">{ready.items.map((i) => <span key={i.label} className={i.ok ? "ok" : ""} />)}</div>
          <ul className="checklist">
            {ready.items.map((i) => (
              <li key={i.label} className={i.ok ? "ok" : "todo"}><Icon name={i.ok ? "check" : "clock"} size={18} stroke={2.2} />{i.label}</li>
            ))}
          </ul>
        </a>
      </section>

      <section className="grid-4" aria-label="Period in numbers">
        <Kpi dot="in" label="Money in" value={nf(d.moneyIn)} note={`${model.moneyInCount} sales & receipts`} />
        <Kpi dot="out" label="Operating costs" value={nf(d.operatingOut)} note="Stock, rent, wages, fees" />
        <Kpi dot="asset" label="Asset spend" value={nf(d.assetSpend)} note="Kept out of profit" />
        <Kpi dot="fee" label="Fees & IMTT" value={nf(model.charges)} note={Number(d.moneyIn) > 0 ? `${((Number(model.charges) / Number(d.moneyIn)) * 100).toFixed(1)}% of money in` : "Charged by rails"} />
      </section>

      <section className="grid-3">
        <div className="card span-2">
          <div className="card-head"><h2>Profit, last 6 months</h2><span className="muted">{basisLabel(basis)} · {cur}</span></div>
          <div className="bars" role="img" aria-label={`Monthly profit: ${months.map((m) => `${m.label} ${nf(m.profit)}`).join(", ")}`}>
            {months.map((m, i) => {
              const v = Number(m.profit);
              const h = Math.max(4, Math.round((Math.abs(v) / maxAbs) * 170));
              return (
                <div key={m.label} className="bar-col">
                  {i === months.length - 1 && <span className="bar-label num">{nf(m.profit)}</span>}
                  <span className={`bar ${v < 0 ? "neg" : ""} ${i === months.length - 1 ? "current" : ""}`} style={{ height: h }} title={`${m.label}: ${nf(m.profit)}`} />
                </div>
              );
            })}
          </div>
          <div className="bar-axis">{months.map((m) => <span key={m.label}>{m.label}</span>)}</div>
          {months.some((m) => isNeg(m.profit)) && <p className="fine">Orange bars are months with a loss.</p>}
        </div>

        <div className="card">
          <div className="card-head"><h2>Cash by method</h2><span className="muted">Net recorded</span></div>
          {cashRows.length === 0 && <p className="muted">No activity yet.</p>}
          <div className="rail-list">
            {cashRows.map(([rail, v]) => (
              <div key={rail} className="rail-row">
                <div className="rail-top"><span>{RAIL_LABEL[rail as keyof typeof RAIL_LABEL] ?? rail}</span><span className={`num ${isNeg(v) ? "neg-text" : ""}`}>{nf(v)}</span></div>
                <div className="rail-track"><div className={`rail-fill ${isNeg(v) ? "neg" : ""}`} style={{ width: `${Math.round((Math.abs(Number(v)) / cashMax) * 100)}%` }} title={`${rail}: ${nf(v)}`} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card flush">
        <div className="card-head pad"><h2>Recent activity</h2><a href="#/statement">See statement</a></div>
        <table className="table">
          <thead>
            <tr><th scope="col">What</th><th scope="col" className="hide-sm">Paid via</th><th scope="col" className="hide-sm">Category</th><th scope="col" className="right">Amount</th></tr>
          </thead>
          <tbody>
            {recent.map((t) => <ActivityRow key={t.id} t={t} />)}
          </tbody>
        </table>
        <p className="fine pad">Amounts show in the currency they were recorded in.</p>
      </section>
    </>
  );
}

function Kpi({ dot, label, value, note }: { dot: string; label: string; value: string; note: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label"><span className={`dot ${dot}`} />{label}</div>
      <span className="kpi-value num">{value}</span>
      <span className="muted">{note}</span>
    </div>
  );
}

export function ActivityRow({ t }: { t: Transaction }) {
  const isIn = t.direction === "IN";
  return (
    <tr>
      <td>
        <div className="what">
          <span className={`what-icon ${isIn ? "in" : "out"}`}><Icon name={isIn ? "up" : "down"} size={16} stroke={2.4} /></span>
          <div><div className="strong">{t.note || CAT_LABEL[t.category]}</div><div className="muted">{longDate(t.date)}</div></div>
        </div>
      </td>
      <td className="hide-sm">{RAIL_LABEL[t.rail]}</td>
      <td className="hide-sm"><span className={`pill ${t.isAsset ? "asset" : ""}`}>{t.isAsset ? "Asset" : CAT_LABEL[t.category]}</span></td>
      <td className={`right num strong ${isIn ? "in-text" : "out-text"}`}>
        {isIn ? "+" : "−"}{sym(t.currency)}{fmt(t.amount, t.currency).replace(/^[^\d]*/, "")}
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <>
      <section className="hero">
        <Chevrons id="heroChevE" color="#FFFFFF" opacity={0.13} />
        <div className="hero-inner narrow">
          <span className="eyebrow gold">Welcome to MariBooks</span>
          <h2 className="display hero-title">Record your first sale and we'll tell you if you're making money.</h2>
          <p className="hero-answer">Log money in and out in USD, ZiG or ZAR, on any rail. Every amount stays in the currency it happened in.</p>
          <a href="#/record" className="btn gold lg"><Icon name="plus" size={18} stroke={2.4} />Record money</a>
        </div>
      </section>
      <section className="grid-3">
        {[
          ["1", "Record today's money", "Sales in, stock and rent out. Add the fee or IMTT as a percentage so it isn't lost.", "#/record", "Record money"],
          ["2", "Use your market rate", "Paid in ZiG or rand? Enter the rate you actually got. Profit is worked out with it.", "#/record", "Record a ZiG sale"],
          ["3", "Tag big purchases as assets", "A fridge isn't a cost of the month. Assets build your credit passport.", "#/passport", "About the passport"],
        ].map(([n, t, b, href, cta]) => (
          <div key={n} className="card step">
            <span className="step-n display">{n}</span>
            <h3>{t}</h3>
            <p className="muted">{b}</p>
            <a href={href}>{cta}</a>
          </div>
        ))}
      </section>
    </>
  );
}
