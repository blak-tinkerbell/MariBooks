import { useEffect, useState, type FormEvent } from "react";
import { CURRENCY_PAIRS, type CurrencyPair } from "@maribooks/shared";
import type { AppData } from "../App.js";
import { UnauthorizedError } from "../api.js";
import { latestStreetRates, longDate, todayISO } from "../lib.js";
import { FieldError, Notice, PageHeader } from "../ui.js";

const RATE = /^\d+(\.\d{1,6})?$/;

export function Settings({ data }: { data: AppData }) {
  const today = todayISO();
  const [name, setName] = useState(data.businessName);
  const [nameTried, setNameTried] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [pair, setPair] = useState<CurrencyPair>("USD/ZiG");
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState("");
  const [tried, setTried] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => setName(data.businessName), [data.businessName]);

  const nameErr = name.trim().length < 2 ? "Enter your business name." : name.trim().length > 80 ? "Keep it under 80 characters." : "";
  const rateErr = !rate.trim() ? "Enter the rate." : !RATE.test(rate.trim()) || Number(rate) <= 0 ? "The rate must be a number above 0 (up to 6 decimals)." : "";
  const dateErr = !date ? "Pick a date." : date > today ? "The date can't be in the future." : "";
  const [base, quote] = pair.split("/");
  const history = data.rates.history().sort((a, b) => (a.date < b.date ? 1 : -1));
  const streets = latestStreetRates(data.txns);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameTried(true);
    if (nameErr) return;
    try {
      await data.setBusinessName(name.trim());
      setNameMsg("Saved.");
    } catch (err) {
      if (err instanceof UnauthorizedError) return data.onAuthLost();
      setNameMsg((err as Error).message);
    }
  }

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setMsg(null);
    if (rateErr || dateErr) return;
    try {
      await data.store.putRate({ pair, date, rate: rate.trim(), source: "MANUAL" });
      await data.reloadRates();
      setMsg({ tone: "ok", text: `Saved: 1 ${base} = ${rate.trim()} ${quote} from ${longDate(date)}.` });
      setRate("");
      setTried(false);
    } catch (err) {
      if (err instanceof UnauthorizedError) return data.onAuthLost();
      setMsg({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader title="Rates & settings" sub="Your market rates come from your own entries. Official rates drive statutory-style reports." />

      <section className="grid-2 align-start">
        <div className="stack">
          <div className="card stack-sm">
            <h2>Your market rates</h2>
            <p className="muted">The rate you actually got, taken from your latest ZiG and ZAR entries.</p>
            {streets.ZiG || streets.ZAR ? (
              <table className="table fin">
                <tbody>
                  {(["ZiG", "ZAR"] as const).map((c) => streets[c] && (
                    <tr key={c}><th scope="row">1 USD = {streets[c]!.perUsd} {c}</th><td className="right muted">{longDate(streets[c]!.date)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">None yet. Record a ZiG or ZAR entry to set one.</p>}
          </div>

          <form className="card stack-sm" onSubmit={saveName} noValidate>
            <h2>Business</h2>
            <div className="field">
              <label htmlFor="biz">Business name</label>
              <input id="biz" className={`input ${nameTried && nameErr ? "invalid" : ""}`} value={name} onChange={(e) => { setName(e.target.value); setNameMsg(""); }} aria-invalid={nameTried && !!nameErr} aria-describedby="err-biz" />
              <FieldError id="err-biz" msg={nameTried ? nameErr : ""} />
              <span className="help">Shown on your statement and credit passport.</span>
            </div>
            <button type="submit" className="btn primary">Save name</button>
            {nameMsg && <p className="help" role="status">{nameMsg}</p>}
          </form>
        </div>

        <div className="stack">
          {data.ratesSample && (
            <Notice tone="warn">Sample reference rates are in use. Add the official rate for each pair so "Official" reports are accurate.</Notice>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <form className="card stack-sm" onSubmit={saveRate} noValidate>
            <h2>Add an official rate</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pair">Currency pair</label>
                <select id="pair" className="input" value={pair} onChange={(e) => setPair(e.target.value as CurrencyPair)}>
                  {CURRENCY_PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rdate">Effective from</label>
                <input id="rdate" type="date" className={`input ${tried && dateErr ? "invalid" : ""}`} max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-describedby="err-rdate" />
                <FieldError id="err-rdate" msg={tried ? dateErr : ""} />
              </div>
              <div className="field span-2">
                <label htmlFor="rate">Rate</label>
                <div className={`input-wrap ${tried && rateErr ? "invalid" : ""}`}>
                  <span className="affix">1 {base} =</span>
                  <input id="rate" className="num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={tried && !!rateErr} aria-describedby="err-rate" />
                  <span className="affix">{quote}</span>
                </div>
                <FieldError id="err-rate" msg={tried ? rateErr : ""} />
              </div>
            </div>
            <button type="submit" className="btn primary">Save rate</button>
          </form>

          <div className="card flush">
            <div className="pad"><h2>Official rate history</h2></div>
            <table className="table">
              <thead><tr><th scope="col">Pair</th><th scope="col">From</th><th scope="col" className="right">Rate</th></tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={`${r.pair}-${r.date}`}>
                    <td>{r.pair}{r.note?.startsWith("Sample") && <span className="pill">Sample</span>}</td>
                    <td>{longDate(r.date)}</td>
                    <td className="right num">{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
