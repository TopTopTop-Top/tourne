import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { createLeague, joinLeague, listMyLeagues } from "../cloud";
import { Mark } from "../ui";

export default function CloudHome({ open }) {
  const auth = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState(1);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setLeagues(await listMyLeagues());
    } catch (err) {
      setError(err.message || "Impossible de charger les ligues.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(event) {
    event.preventDefault();
    setError("");
    try {
      const league = await createLeague(name, tier);
      setCreating(false);
      setName("");
      await refresh();
      open({ name: "cloud-league", leagueId: league.id });
    } catch (err) {
      setError(err.message || "Création impossible.");
    }
  }

  async function onJoin(event) {
    event.preventDefault();
    setError("");
    try {
      const league = await joinLeague(code);
      setCode("");
      await refresh();
      open({ name: "cloud-league", leagueId: league.id });
    } catch (err) {
      setError(err.message || "Code invalide.");
    }
  }

  return (
    <div className="stack">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Tourne</strong>
            <span>{auth.profile?.display_name || "Compte"}</span>
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn btn-small btn-primary" onClick={() => open({ name: "cloud-me" })}>
            Mes stats
          </button>
          <button type="button" className="btn btn-small" onClick={() => auth.logout()}>
            Déconnexion
          </button>
        </div>
      </header>

      <p className="pitch">Tes ligues. Invite avec un code. Les 4 valident le score. Tes stats suivent partout.</p>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="note">Chargement…</p> : null}

      <div className="cards">
        {leagues.map((league) => (
          <button
            key={league.id}
            type="button"
            className="league-card"
            onClick={() => open({ name: "cloud-league", leagueId: league.id })}
          >
            <span className="watermark">{league.tier}</span>
            <span className="eyebrow">Niveau {league.tier}</span>
            <strong>{league.name}</strong>
            <span className="card-meta">Code {league.invite_code} · {league.myRole}</span>
            <span className="card-foot">
              <span>Ouvrir</span>
            </span>
          </button>
        ))}
      </div>

      {!loading && !leagues.length ? (
        <section className="section">
          <h2>Aucune ligue encore</h2>
          <p className="note">Crée la tienne, ou rejoins avec un code d'ami.</p>
        </section>
      ) : null}

      {creating ? (
        <form className="section stack" onSubmit={onCreate}>
          <h2>Nouvelle ligue</h2>
          <label className="field">
            Nom
            <input value={name} maxLength={32} required onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            Niveau
            <input type="number" min={1} max={20} value={tier} onChange={(event) => setTier(event.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className="btn btn-primary">
              Créer
            </button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Créer une ligue
        </button>
      )}

      <form className="section stack" onSubmit={onJoin}>
        <h2>Rejoindre</h2>
        <label className="field">
          Code d'invitation
          <input value={code} required maxLength={12} placeholder="ABCD1234" onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </label>
        <button type="submit" className="btn">
          Rejoindre la ligue
        </button>
      </form>

      <button type="button" className="btn btn-small" onClick={() => auth.useLocal()}>
        Passer en mode local
      </button>
    </div>
  );
}
