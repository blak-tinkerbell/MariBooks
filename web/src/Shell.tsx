import type { ReactNode } from "react";
import type { AppData, Route } from "./App.js";
import { Chevrons, Icon, Logo, type IconName } from "./icons.js";
import { latestStreetRates } from "./lib.js";

const NAV: { route: Route; label: string; short: string; icon: IconName }[] = [
  { route: "dashboard", label: "Dashboard", short: "Home", icon: "dashboard" },
  { route: "record", label: "Record money", short: "Record", icon: "record" },
  { route: "statement", label: "Statement", short: "Statement", icon: "statement" },
  { route: "passport", label: "Credit passport", short: "Passport", icon: "passport" },
  { route: "settings", label: "Rates & settings", short: "Rates", icon: "rates" },
];

// Record sits in the middle of the phone bar as the primary action.
const BOTTOM = [NAV[0]!, NAV[2]!, NAV[1]!, NAV[3]!, NAV[4]!];

export function Shell({ route, data, email, onLeave, onResetDemo, banner, children }: {
  route: Route;
  data: AppData;
  email: string | null;
  onLeave: () => void;
  onResetDemo?: () => void;
  banner: { online: boolean; pending: number; loadErr: string };
  children: ReactNode;
}) {
  const demo = data.store.mode === "demo";
  const street = latestStreetRates(data.txns);

  return (
    <div className="shell">
      <aside className="side no-print">
        <Chevrons id="sideChev" height={150} className="side-art" opacity={0.16} />
        <div className="side-inner">
          <a href="#/dashboard" className="side-brand">
            <Logo />
            <span>MariBooks</span>
          </a>
          <div className="side-biz">
            <div className="eyebrow">Business</div>
            <div className="side-biz-name">{data.businessName || "…"}</div>
            <div className="side-biz-meta">{demo ? "Demo · sample data" : "Base currency · USD"}</div>
          </div>
          <nav aria-label="Main" className="side-nav">
            {NAV.map((n) => (
              <a key={n.route} href={`#/${n.route}`} className={`side-link ${route === n.route ? "on" : ""}`} aria-current={route === n.route ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </a>
            ))}
          </nav>
          <div className="grow" />
          <div className="side-rate">
            <div className="eyebrow gold">Your latest market rate</div>
            {street.ZiG || street.ZAR ? (
              <>
                {street.ZiG && <div className="num">1 USD = {street.ZiG.perUsd} ZiG</div>}
                {street.ZAR && <div className="num">1 USD = {street.ZAR.perUsd} ZAR</div>}
              </>
            ) : (
              <div className="side-rate-empty">Recorded when you log a ZiG or ZAR entry.</div>
            )}
            <a href="#/settings">Official rates</a>
          </div>
          <div className="side-user">
            <span className="avatar"><Icon name="user" size={18} /></span>
            <div className="side-user-text">
              <div>{demo ? "Demo visitor" : email ?? "Owner"}</div>
              <div className="dim">{demo ? "Nothing is sent to the cloud" : "Owner"}</div>
            </div>
            <button type="button" className="icon-btn" aria-label={demo ? "Exit demo" : "Sign out"} title={demo ? "Exit demo" : "Sign out"} onClick={onLeave}>
              <Icon name="signout" />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="main-art no-print" aria-hidden="true">
          <svg width="520" height="360" viewBox="0 0 520 360">
            <circle cx="360" cy="140" r="120" fill="none" stroke="#D5EAE4" strokeWidth="2" />
            <circle cx="360" cy="140" r="170" fill="none" stroke="#DDEEE9" strokeWidth="2" />
            <circle cx="360" cy="140" r="220" fill="none" stroke="#E6F2EE" strokeWidth="2" />
            <circle cx="360" cy="140" r="64" fill="#FBEFD6" />
          </svg>
        </div>
        <div className="mobile-top no-print">
          <a href="#/dashboard" className="side-brand dark">
            <Logo size={30} />
            <span>MariBooks</span>
          </a>
          <button type="button" className="icon-btn light" aria-label={demo ? "Exit demo" : "Sign out"} onClick={onLeave}>
            <Icon name="signout" />
          </button>
        </div>
        <div className="container">
          {demo && (
            <div className="demo-banner no-print">
              <Icon name="info" size={18} stroke={2} />
              <span><strong>You're exploring a demo business.</strong> Six months of sample records, kept only in this browser.</span>
              <span className="demo-actions">
                {onResetDemo && <button type="button" className="link-btn" onClick={onResetDemo}>Reset demo</button>}
                <button type="button" className="link-btn" onClick={onLeave}>Create your own account</button>
              </span>
            </div>
          )}
          {!banner.online && (
            <div className="notice warn no-print" role="status">
              <Icon name="cloudOff" size={18} stroke={2} />
              <div>You're offline. New entries are kept on this device and sync when you reconnect.</div>
            </div>
          )}
          {banner.online && banner.pending > 0 && (
            <div className="notice warn no-print" role="status">
              <Icon name="clock" size={18} stroke={2} />
              <div>{banner.pending} saved {banner.pending === 1 ? "entry is" : "entries are"} waiting to sync.</div>
            </div>
          )}
          {banner.loadErr && (
            <div className="notice error no-print" role="alert">
              <Icon name="alert" size={18} stroke={2} />
              <div>Couldn't load your records: {banner.loadErr}</div>
            </div>
          )}
          {children}
        </div>
      </main>

      <nav className="bottom-nav no-print" aria-label="Main">
        {BOTTOM.map((n) =>
          n.route === "record" ? (
            <a key={n.route} href="#/record" className="bottom-fab" aria-current={route === n.route ? "page" : undefined}>
              <span><Icon name="plus" size={24} stroke={2.4} /></span>
              {n.short}
            </a>
          ) : (
            <a key={n.route} href={`#/${n.route}`} className={route === n.route ? "on" : ""} aria-current={route === n.route ? "page" : undefined}>
              <Icon name={n.icon} size={22} />
              {n.short}
            </a>
          ),
        )}
      </nav>
    </div>
  );
}
