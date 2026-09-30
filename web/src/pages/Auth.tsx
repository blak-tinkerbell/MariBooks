import { useState, type FormEvent } from "react";
import { confirmSignUp, signIn, signUp } from "../auth.js";
import { Chevrons, Icon, Logo } from "../icons.js";
import { FieldError, Seg } from "../ui.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Mirrors the Cognito user-pool password policy so problems show before the round trip.
const PW_RULES: { test: (p: string) => boolean; label: string }[] = [
  { test: (p) => p.length >= 10, label: "10+ characters" },
  { test: (p) => /[a-z]/.test(p), label: "a lowercase letter" },
  { test: (p) => /[A-Z]/.test(p), label: "an uppercase letter" },
  { test: (p) => /\d/.test(p), label: "a number" },
  { test: (p) => /[^A-Za-z0-9]/.test(p), label: "a symbol" },
];

type Mode = "in" | "up" | "confirm";

export function Auth({ onSignedIn, onDemo }: { onSignedIn: () => void; onDemo: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const emailErr = !EMAIL.test(email.trim()) ? "Enter a valid email address." : "";
  const failing = PW_RULES.filter((r) => !r.test(password));
  const pwErr = mode === "in" ? (password ? "" : "Enter your password.") : failing.length ? `Password needs ${failing.map((r) => r.label).join(", ")}.` : "";
  const codeErr = /^\d{6}$/.test(code.trim()) ? "" : "Enter the 6-digit code from your email.";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setErr("");
    if (mode === "confirm" ? codeErr : emailErr || pwErr) return;
    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email.trim(), password);
        onSignedIn();
      } else if (mode === "up") {
        await signUp(email.trim(), password);
        setMode("confirm");
        setTried(false);
      } else {
        await confirmSignUp(email.trim(), code.trim());
        await signIn(email.trim(), password);
        onSignedIn();
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const show1 = (m: string) => (tried ? m : "");

  return (
    <div className="auth">
      <section className="auth-art">
        <Chevrons id="authChev" height={110} opacity={0.2} />
        <svg className="auth-rings" aria-hidden="true" width="560" height="560" viewBox="0 0 560 560">
          <circle cx="280" cy="280" r="260" fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth="2" />
          <circle cx="280" cy="280" r="190" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="2" />
          <circle cx="280" cy="280" r="120" fill="none" stroke="#E0A43A" strokeOpacity="0.3" strokeWidth="2" />
          <circle cx="280" cy="280" r="54" fill="#E0A43A" fillOpacity="0.25" />
        </svg>
        <div className="side-brand"><Logo /><span>MariBooks</span></div>
        <div className="auth-pitch">
          <h1>Know if you're making money, in any currency.</h1>
          <ul>
            <li><Icon name="check" stroke={2.4} />USD, ZiG and rand, on cash, EcoCash, InnBucks and bank</li>
            <li><Icon name="check" stroke={2.4} />Profit at the rate you actually got, not a guess</li>
            <li><Icon name="check" stroke={2.4} />A credit passport you share only when you choose</li>
          </ul>
        </div>
      </section>

      <main className="auth-main">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-mobile-brand"><Logo size={30} /><span>MariBooks</span></div>
          <div>
            <h2>{mode === "in" ? "Welcome back" : mode === "up" ? "Create your account" : "Check your email"}</h2>
            <p className="muted-lg">
              {mode === "in" ? "Sign in to see your dashboard." : mode === "up" ? "Free while you grow. Takes two minutes." : `We sent a 6-digit code to ${email}.`}
            </p>
          </div>

          <button type="button" className="btn gold block" onClick={onDemo}>
            <Icon name="sparkle" />
            Try the demo — no sign-up
          </button>
          <div className="or"><span>or use your account</span></div>

          {mode !== "confirm" && (
            <Seg
              label="Account"
              className="full"
              value={mode}
              onChange={(m) => { setMode(m); setTried(false); setErr(""); }}
              options={[{ value: "in", label: "Sign in" }, { value: "up", label: "Create account" }]}
            />
          )}

          {mode === "confirm" ? (
            <div className="field">
              <label htmlFor="code">Verification code</label>
              <input id="code" className={`input num ${show1(codeErr) ? "invalid" : ""}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-invalid={!!show1(codeErr)} aria-describedby="err-code" />
              <FieldError id="err-code" msg={show1(codeErr)} />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" className={`input ${show1(emailErr) ? "invalid" : ""}`} autoComplete="email" placeholder="you@shop.co.zw" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!show1(emailErr)} aria-describedby="err-email" />
                <FieldError id="err-email" msg={show1(emailErr)} />
              </div>
              <div className="field">
                <label htmlFor="pw">Password</label>
                <div className={`input-wrap ${show1(pwErr) ? "invalid" : ""}`}>
                  <input id="pw" type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!show1(pwErr)} aria-describedby="err-pw pw-rules" />
                  <button type="button" className="chip-btn" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
                </div>
                {mode === "up" && (
                  <ul id="pw-rules" className="pw-rules">
                    {PW_RULES.map((r) => (
                      <li key={r.label} className={r.test(password) ? "ok" : ""}><Icon name={r.test(password) ? "check" : "info"} size={14} stroke={2.4} />{r.label}</li>
                    ))}
                  </ul>
                )}
                <FieldError id="err-pw" msg={show1(pwErr)} />
              </div>
            </>
          )}

          {err && <div className="notice error" role="alert"><Icon name="alert" size={18} stroke={2} /><div>{err}</div></div>}

          <button type="submit" className="btn primary block lg" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Confirm & sign in"}
            {!busy && <Icon name="arrow" />}
          </button>
          <p className="fine">Your records stay private to your account. Nothing is shared without your consent.</p>
        </form>
      </main>
    </div>
  );
}
