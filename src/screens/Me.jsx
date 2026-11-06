import { useMemo, useState } from "react";
import { buildMeStats, headToHeadText } from "../meStats";
import { formatScore, formatWhen } from "../format";
import { useStore } from "../store";
import { Avatar, BackHeader, FormDots, RateBar } from "../ui";

export default function Me({ open, back }) {
  const store = useStore();
  const { state } = store;
  const [name, setName] = useState(state.identity?.name || "");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("opponents");

  const stats = useMemo(() => {
    if (!state.identity) return null;
    return buildMeStats({
      identityId: state.identity.id,
      identityName: state.identity.name,
      players: state.players,
      matches: state.matches,
      leagues: state.leagues,
    });
  }, [state]);

  function saveIdentity(event) {
    event.preventDefault();
    const result = store.setIdentity(name);
    setError(result.error || "");
  }

  if (!state.identity) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Mon identité" sub="Pour suivre tes stats partout" />
        <form className="section stack" onSubmit={saveIdentity}>
          <p className="note">Ton prénom te suit dans toutes les ligues. Ensuite tu marques « C'est moi » sur ta fiche.</p>
          <label className="field">
            Ton prénom
            <input value={name} maxLength={24} required onChange={(event) => setName(event.target.value)} placeholder="Hugo" />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-primary">
            C'est moi
          </button>
        </form>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="stack">
      <BackHeader onBack={back} title={state.identity.name} sub="Tes stats versus tous" />

      <section className="section hero-player">
        <Avatar id={state.identity.id} name={state.identity.name} size="lg" />
        <div>
          <p className="eyebrow">Niveau global</p>
          <p className="niveau">{Math.round(stats.rating)}</p>
          <p className="meta">
            {stats.record.played} match{stats.record.played > 1 ? "s" : ""} · {stats.record.wins}V-{stats.record.losses}D
          </p>
          <FormDots form={stats.record.form} />
        </div>
      </section>

      <section className="section stats-grid">
        <div>
          <span className="eyebrow">Sets</span>
          <strong>
            {stats.record.setsFor}-{stats.record.setsAgainst}
          </strong>
        </div>
        <div>
          <span className="eyebrow">Jeux</span>
          <strong>
            {stats.record.gamesFor}-{stats.record.gamesAgainst}
          </strong>
        </div>
        <div>
          <span className="eyebrow">Ligues</span>
          <strong>{stats.leagueRows.length}</strong>
        </div>
        <div>
          <span className="eyebrow">Fiches liées</span>
          <strong>{stats.mine.length}</strong>
        </div>
      </section>

      {stats.leagueRows.length ? (
        <section className="section stack">
          <h2>Par ligue</h2>
          {stats.leagueRows.map((row) => (
            <button
              key={row.leagueId}
              type="button"
              className="duo"
              onClick={() => open({ name: "league", leagueId: row.leagueId })}
            >
              <span className="duo-name">{row.name}</span>
              <span className="duo-rec">
                {row.wins}V-{row.losses}D · {row.played} match{row.played > 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <section className="section">
          <p className="note">Lie une fiche avec « C'est moi » dans une ligue pour commencer le suivi.</p>
        </section>
      )}

      <div className="seg" role="group" aria-label="Versus">
        <button type="button" aria-pressed={tab === "opponents"} onClick={() => setTab("opponents")}>
          En face
        </button>
        <button type="button" aria-pressed={tab === "partners"} onClick={() => setTab("partners")}>
          Avec
        </button>
      </div>

      <section className="section stack">
        <h2>{tab === "opponents" ? "Versus tout le monde" : "Avec tout le monde"}</h2>
        {(tab === "opponents" ? stats.opponents : stats.partners).length ? (
          (tab === "opponents" ? stats.opponents : stats.partners).map((row) => (
            <div key={row.partnerId} className="duo static">
              <span className="duo-name">{row.name}</span>
              <RateBar gamesFor={row.gamesFor} gamesAgainst={row.gamesAgainst} />
              <span className="duo-rec">{headToHeadText(row)}</span>
            </div>
          ))
        ) : (
          <p className="note">Pas encore assez de matchs.</p>
        )}
      </section>

      <section className="section">
        <h2>Derniers matchs</h2>
        {stats.record.matches.length ? (
          <ul className="matches">
            {[...stats.record.matches].reverse().slice(0, 12).map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="match"
                  onClick={() => open({ name: "match", leagueId: match.leagueId, matchId: match.id })}
                >
                  <span className="match-teams">
                    <span>
                      {stats.nameById[match.teamA[0]]} + {stats.nameById[match.teamA[1]]}
                    </span>
                    <span>
                      {stats.nameById[match.teamB[0]]} + {stats.nameById[match.teamB[1]]}
                    </span>
                  </span>
                  <span className="match-score">
                    <b className={match.won ? "up" : "down"}>{match.won ? "Gagné" : "Perdu"}</b>
                    <span>{formatScore(match.sets)}</span>
                  </span>
                  <time>{formatWhen(match.playedAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">Aucun match lié à toi.</p>
        )}
      </section>

      <details className="fold">
        <summary>Changer mon prénom</summary>
        <form className="stack" onSubmit={saveIdentity}>
          <label className="field">
            Prénom
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-small">
            Enregistrer
          </button>
        </form>
      </details>
    </div>
  );
}
