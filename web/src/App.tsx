import { useCallback, useEffect, useMemo, useState } from "react";
import { OfficialRateTable, type Currency, type RateBasis, type Transaction } from "@maribooks/shared";
import { UnauthorizedError } from "./api.js";
import { currentEmail, getIdToken, signOut } from "./auth.js";
import { DemoStore, LiveStore, type DataStore } from "./store.js";
import { Shell } from "./Shell.js";
import { Auth } from "./pages/Auth.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Capture } from "./pages/Capture.js";
import { Statement } from "./pages/Statement.js";
import { Passport } from "./pages/Passport.js";
import { Settings } from "./pages/Settings.js";
import type { ViewProps } from "./ui.js";

export type Route = "dashboard" | "record" | "statement" | "passport" | "settings";
const ROUTES: Route[] = ["dashboard", "record", "statement", "passport", "settings"];

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  return ROUTES.includes(r) ? r : "dashboard";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r: Route) => { window.location.hash = `/${r}`; }];
}

type Session = { kind: "loading" } | { kind: "auth" } | { kind: "live"; email: string | null } | { kind: "demo" };

const wantsDemo = () => new URLSearchParams(window.location.search).has("demo");

export function App() {
  const [session, setSession] = useState<Session>({ kind: "loading" });

  useEffect(() => {
    if (wantsDemo()) return setSession({ kind: "demo" });
    Promise.resolve()
      .then(getIdToken)
      .then((t) => setSession(t ? { kind: "live", email: currentEmail() } : { kind: "auth" }))
      .catch(() => setSession({ kind: "auth" }));
  }, []);

  const store = useMemo<DataStore | null>(() => {
    if (session.kind === "live") return new LiveStore(session.email);
    if (session.kind === "demo") return new DemoStore();
    return null;
  }, [session]);

  if (session.kind === "loading") return <div className="loading">Loading MariBooks…</div>;
  if (session.kind === "auth" || !store) {
    return (
      <Auth
        onSignedIn={() => setSession({ kind: "live", email: currentEmail() })}
        onDemo={() => {
          history.replaceState(null, "", "?demo#/dashboard");
          setSession({ kind: "demo" });
        }}
      />
    );
  }

  const leave = () => {
    if (session.kind === "live") signOut();
    history.replaceState(null, "", window.location.pathname);
    setSession({ kind: "auth" });
  };

  return <Main store={store} email={session.kind === "live" ? session.email : null} onLeave={leave} />;
}

export interface AppData {
  store: DataStore;
  txns: Transaction[];
  loaded: boolean;
  reload: () => Promise<void>;
  rates: OfficialRateTable;
  ratesSample: boolean;
  reloadRates: () => Promise<void>;
  businessName: string;
  setBusinessName: (n: string) => Promise<void>;
  view: ViewProps;
  go: (r: Route) => void;
  onAuthLost: () => void;
}

function Main({ store, email, onLeave }: { store: DataStore; email: string | null; onLeave: () => void }) {
  const [route, go] = useRoute();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [rates, setRates] = useState(() => new OfficialRateTable());
  const [ratesSample, setRatesSample] = useState(false);
  const [businessName, setName] = useState("");
  const [cur, setCur] = useState<Currency>("USD");
  const [basis, setBasis] = useState<RateBasis>("EFFECTIVE");
  const [pending, setPending] = useState(store.pendingCount());
  const [online, setOnline] = useState(navigator.onLine);

  const reload = useCallback(async () => {
    try {
      setTxns(await store.list());
      setLoadErr("");
    } catch (e) {
      if (e instanceof UnauthorizedError) return onLeave();
      setLoadErr((e as Error).message);
    } finally {
      setLoaded(true);
      setPending(store.pendingCount());
    }
  }, [store, onLeave]);

  const reloadRates = useCallback(async () => {
    const r = await store.getRates();
    setRates(new OfficialRateTable(r.rates));
    setRatesSample(r.sample);
  }, [store]);

  useEffect(() => {
    reload();
    reloadRates();
    store.businessName().then(setName);
    const up = () => {
      setOnline(true);
      store.flush().then(reload);
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const data: AppData = {
    store,
    txns,
    loaded,
    reload,
    rates,
    ratesSample,
    reloadRates,
    businessName,
    setBusinessName: async (n) => {
      await store.setBusinessName(n);
      setName(n);
    },
    view: { cur, basis, setCur, setBasis },
    go,
    onAuthLost: onLeave,
  };

  return (
    <Shell
      route={route}
      data={data}
      email={email}
      onLeave={onLeave}
      onResetDemo={store instanceof DemoStore ? () => { store.reset(); reload(); reloadRates(); } : undefined}
      banner={{ online, pending, loadErr }}
    >
      {route === "dashboard" && <Dashboard data={data} />}
      {route === "record" && <Capture data={data} />}
      {route === "statement" && <Statement data={data} />}
      {route === "passport" && <Passport data={data} />}
      {route === "settings" && <Settings data={data} />}
    </Shell>
  );
}
