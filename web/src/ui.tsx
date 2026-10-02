import type { ReactNode } from "react";
import { CURRENCIES, type Currency, type RateBasis } from "@maribooks/shared";
import { Icon } from "./icons.js";

export function Seg<T extends string>({ label, value, options, onChange, className = "" }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`seg ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ViewProps {
  cur: Currency;
  basis: RateBasis;
  setCur: (c: Currency) => void;
  setBasis: (b: RateBasis) => void;
}

export function ViewControls({ cur, basis, setCur, setBasis }: ViewProps) {
  return (
    <div className="view-controls">
      <Seg label="Show amounts in" value={cur} onChange={setCur} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <Seg label="Exchange rate basis" value={basis} onChange={setBasis} options={[{ value: "EFFECTIVE", label: "Market rate" }, { value: "OFFICIAL", label: "Official" }]} />
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <span id={id} role="alert" className="field-error">
      <Icon name="alert" size={16} stroke={2} />
      {msg}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  const icon = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} size={18} stroke={2} />
      <div>{children}</div>
    </div>
  );
}

export function basisLabel(basis: RateBasis) {
  return basis === "EFFECTIVE" ? "Your market rate" : "Official reference rate";
}
