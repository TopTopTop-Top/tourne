import { useMemo, useState } from "react";
import { pairCoverage, playerRecord, computeRatings } from "../logic";
import { useStore } from "../store";
import { Mark } from "../ui";

export default function Home({ open }) {
  const store = useStore();
  const { state } = store;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState(1);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");

  const ratings = useMemo(() => computeRatings(state.players, state.matches).rating, [state.players, state.matches]);
  const leagues = state.leagues.slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "fr"));

  function startCreate() {
    const nextTier = leagues.reduce((max, league) => Math.max(max, league.tier), 0) + 1;
    setTier(nextTier || 1);
    setName(`Ligue ${nextTier || 1}`);
    setError("");
    setCreating(true);
  }

  function submitLeague(event) {
    event.preventDefault();
    const result = store.addLeague(name, tier);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCreating(false);
    open({ name: "league", leagueId: result.league.id });
  }

  function wipe() {
    if (window.confirm("Effacer toutes les ligues et tous les matchs sur cet appareil ?")) store.resetEmpty();
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const result = store.replaceState(data);
      setFileError(result.error || "");
    } catch {
      setFileError("Fichier illisible.");
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tourne-ligue.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Tourne</strong>
            <span>Ligue de padel</span>
          </div>
        </div>
        <button type="button" className="btn btn-small btn-primary" onClick={() => open({ name: "me" })}>
          {state.identity?.name || "Mon identité"}
        </button>
      </header>

      <p className="pitch">
        Les partenaires tournent. On note les 3 sets. Identifie-toi pour suivre tes stats versus tous les joueurs.
      </p>

      {state.demo ? (
        <div className="banner">
          <p>Exemple déjà joué. Hugo gagne largement avec Camille, puis perd avec Inès : ce n'était pas le même niveau.</p>
          <button type="button" className="btn btn-small" onClick={wipe}>
            Partir de zéro
          </button>
        </div>
      ) : null}

      {!leagues.length ? (
        <section className="section empty-hero">
          <h2>Une ligue, pas un tableau.</h2>
          <p>Quatre joueurs, trois sets, puis on change les partenaires. Chacun doit finir par jouer avec chacun.</p>
        </section>
      ) : null}

      <div className="cards">
        {leagues.map((league) => {
          const members = state.players.filter((player) => player.leagueId === league.id);
          const played = state.matches.filter((match) => match.leagueId === league.id && match.status === "played");
          const coverage = pairCoverage(members, state.matches, "with");
          const leader = members.slice().sort((a, b) => ratings[b.id] - ratings[a.id])[0];
          const leaderRecord = leader ? playerRecord(leader.id, state.matches) : null;
          return (
            <button key={league.id} type="button" className="league-card" onClick={() => open({ name: "league", leagueId: league.id })}>
              <span className="watermark">{league.tier}</span>
              <span className="eyebrow">Niveau {league.tier}</span>
              <strong>{league.name}</strong>
              <span className="card-meta">
                {members.length} joueur{members.length > 1 ? "s" : ""} · {played.length} match{played.length > 1 ? "s" : ""}
              </span>
              <span className="card-foot">
                <span>Paires croisées {coverage.done}/{coverage.total || 0}</span>
                {leader && leaderRecord?.played ? <span>{leader.name} {Math.round(ratings[leader.id])}</span> : <span>En attente de scores</span>}
              </span>
            </button>
          );
        })}
      </div>

      {creating ? (
        <form className="section stack" onSubmit={submitLeague}>
          <h2>Nouvelle ligue</h2>
          <label className="field">
            Nom
            <input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            Niveau
            <input type="number" min={1} max={20} value={tier} onChange={(event) => setTier(event.target.value)} />
          </label>
          <p className="note">1 est la ligue la plus haute. On y monte quand les scores dépassent nettement le reste du groupe.</p>
          {error ? <p className="error">{error}</p> : null}
          <div className="row">
            <button type="submit" className="btn btn-primary">Créer</button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          Créer une ligue
        </button>
      )}

      <details className="fold">
        <summary>Données sur cet appareil</summary>
        <p className="note">Rien n'est envoyé. Les scores restent dans ce navigateur.</p>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={exportFile}>Exporter</button>
          <label className="btn btn-small file-btn">
            Importer
            <input type="file" accept="application/json" onChange={importFile} />
          </label>
          <button type="button" className="btn btn-small" onClick={() => store.resetDemo()}>Recharger l'exemple</button>
          <button type="button" className="btn btn-small btn-danger" onClick={wipe}>Tout effacer</button>
        </div>
        {fileError ? <p className="error">{fileError}</p> : null}
      </details>
    </div>
  );
}
