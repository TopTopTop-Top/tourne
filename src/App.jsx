import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { StoreProvider } from "./store";
import { probeSchema } from "./cloud";
import Auth from "./screens/Auth";
import Setup from "./screens/Setup";
import CloudHome from "./screens/CloudHome";
import CloudLeague from "./screens/CloudLeague";
import CloudMatch from "./screens/CloudMatch";
import CloudMe from "./screens/CloudMe";
import Home from "./screens/Home";
import League from "./screens/League";
import Player from "./screens/Player";
import Match from "./screens/Match";
import Day from "./screens/Day";
import Me from "./screens/Me";

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const auth = useAuth();
  const [schema, setSchema] = useState({ checked: false, ok: false, missing: false });

  useEffect(() => {
    if (!auth.configured || auth.mode !== "cloud") {
      setSchema({ checked: true, ok: false, missing: false });
      return;
    }
    let alive = true;
    const timeout = window.setTimeout(() => {
      if (alive) setSchema({ checked: true, ok: false, missing: true });
    }, 3000);

    probeSchema()
      .then((result) => {
        if (!alive) return;
        setSchema({ checked: true, ok: result.ok, missing: Boolean(result.missing) });
      })
      .catch(() => {
        if (alive) setSchema({ checked: true, ok: false, missing: true });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [auth.configured, auth.mode, auth.session]);

  // Ne bloque jamais l'UI : en local on entre tout de suite.
  if (auth.loading && auth.mode === "cloud") {
    return (
      <div className="app">
        <main>
          <p className="note">Chargement…</p>
          <button type="button" className="btn" onClick={() => auth.useLocal()}>
            Ouvrir l'app en local
          </button>
        </main>
      </div>
    );
  }

  if (auth.mode === "cloud" && auth.configured && !schema.checked) {
    return (
      <div className="app">
        <main>
          <p className="note">Vérification Supabase…</p>
          <button type="button" className="btn" onClick={() => auth.useLocal()}>
            Ouvrir l'app en local
          </button>
        </main>
      </div>
    );
  }

  if (auth.mode === "cloud" && auth.configured && schema.missing) {
    return (
      <div className="app">
        <main>
          <Setup
            onReady={() => setSchema({ checked: true, ok: true, missing: false })}
          />
        </main>
      </div>
    );
  }

  if (auth.mode === "cloud" && auth.configured && !auth.session) {
    return (
      <div className="app">
        <main>
          <Auth />
        </main>
      </div>
    );
  }

  if (auth.mode === "cloud" && auth.session) {
    return <CloudShell />;
  }

  return (
    <StoreProvider>
      <LocalShell />
    </StoreProvider>
  );
}

function CloudShell() {
  const [stack, setStack] = useState([{ name: "cloud-home" }]);
  const screen = stack[stack.length - 1];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    if (window.history.state?.tourne) return;
    window.history.replaceState({ tourne: true, depth: 1 }, "");
  }, []);

  useEffect(() => {
    function onPop() {
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function open(next) {
    setStack((current) => {
      if (next.replace) {
        const copy = current.slice();
        copy[copy.length - 1] = next;
        return copy;
      }
      window.history.pushState({ tourne: true, depth: current.length + 1 }, "");
      return [...current, next];
    });
  }

  function back() {
    if (stack.length > 1) window.history.back();
  }

  return (
    <div className="app">
      <main>
        {screen.name === "cloud-home" && <CloudHome open={open} />}
        {screen.name === "cloud-league" && <CloudLeague leagueId={screen.leagueId} open={open} back={back} />}
        {screen.name === "cloud-me" && <CloudMe open={open} back={back} />}
        {screen.name === "cloud-match" && (
          <CloudMatch leagueId={screen.leagueId} seasonId={screen.seasonId} players={screen.players || []} back={back} />
        )}
      </main>
    </div>
  );
}

function LocalShell() {
  const auth = useAuth();
  const [stack, setStack] = useState([{ name: "home" }]);
  const screen = stack[stack.length - 1];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  function open(next) {
    setStack((current) => [...current, next]);
  }

  function back() {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }

  return (
    <div className="app">
      <main>
        {auth.configured ? (
          <button type="button" className="btn btn-small cloud-switch" onClick={() => auth.useCloud()}>
            Mode cloud / compte
          </button>
        ) : null}
        {screen.name === "home" && <Home open={open} />}
        {screen.name === "me" && <Me open={open} back={back} />}
        {screen.name === "league" && <League leagueId={screen.leagueId} open={open} back={back} />}
        {screen.name === "player" && <Player playerId={screen.playerId} open={open} back={back} />}
        {screen.name === "day" && <Day leagueId={screen.leagueId} sessionId={screen.sessionId} open={open} back={back} />}
        {screen.name === "match" && (
          <Match
            leagueId={screen.leagueId}
            matchId={screen.matchId}
            preset={screen.preset}
            sessionId={screen.sessionId}
            seasonId={screen.seasonId}
            back={back}
          />
        )}
      </main>
    </div>
  );
}
