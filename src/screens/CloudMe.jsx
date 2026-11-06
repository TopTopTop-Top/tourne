import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { loadMyUniverse } from "../cloud";
import { buildMeStats, headToHeadText } from "../meStats";
import { formatScore, formatWhen } from "../format";
import { Avatar, BackHeader, FormDots, RateBar } from "../ui";

export default function CloudMe({ open, back }) {
  const auth = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("opponents");

  useEffect(() => {
    loadMyUniverse()
      .then(setData)
      .catch((err) => setError(err.message || "Impossible de charger tes stats."));
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    return buildMeStats({
      identityId: data.userId,
      identityName: auth.profile?.display_name,
      players: data.allPlayers,
      matches: data.matches,
      leagues: data.leagues,
    });
  }, [data, auth.profile]);

  if (error) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Mes stats" />
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Mes stats" />
        <p className="note">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <BackHeader onBack={back} title={auth.profile?.display_name || "Moi"} sub="Versus tous les joueurs" />

      <section className="section hero-player">
        <Avatar id={auth.user?.id || "me"} name={auth.profile?.display_name || "Moi"} size="lg" />
        <div>
          <p className="eyebrow">Niveau</p>
          <p className="niveau">{Math.round(stats.rating)}</p>
          <p className="meta">
            {stats.record.played} match{stats.record.played > 1 ? "s" : ""} confirmés · {stats.record.wins}V-{stats.record.losses}D
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
          <span className="eyebrow">Fiches</span>
          <strong>{data.players.length}</strong>
        </div>
      </section>

      {!data.players.length ? (
        <section className="section">
          <p className="note">Dans chaque ligue, clique « C'est moi » sur ta fiche joueur pour lier ton compte.</p>
        </section>
      ) : null}

      {stats.leagueRows.length ? (
        <section className="section stack">
          <h2>Par ligue</h2>
          {stats.leagueRows.map((row) => (
            <button key={row.leagueId} type="button" className="duo" onClick={() => open({ name: "cloud-league", leagueId: row.leagueId })}>
              <span className="duo-name">{row.name}</span>
              <span className="duo-rec">
                {row.wins}V-{row.losses}D
              </span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="seg" role="group" aria-label="Versus">
        <button type="button" aria-pressed={tab === "opponents"} onClick={() => setTab("opponents")}>
          En face
        </button>
        <button type="button" aria-pressed={tab === "partners"} onClick={() => setTab("partners")}>
          Avec
        </button>
      </div>

      <section className="section stack">
        <h2>{tab === "opponents" ? "Contre tout le monde" : "Avec tout le monde"}</h2>
        {(tab === "opponents" ? stats.opponents : stats.partners).length ? (
          (tab === "opponents" ? stats.opponents : stats.partners).map((row) => (
            <div key={row.partnerId} className="duo static">
              <span className="duo-name">{row.name}</span>
              <RateBar gamesFor={row.gamesFor} gamesAgainst={row.gamesAgainst} />
              <span className="duo-rec">{headToHeadText(row)}</span>
            </div>
          ))
        ) : (
          <p className="note">Pas encore de confrontations confirmées.</p>
        )}
      </section>

      <section className="section">
        <h2>Matchs</h2>
        {stats.record.matches.length ? (
          <ul className="matches">
            {[...stats.record.matches].reverse().slice(0, 20).map((match) => (
              <li key={match.id}>
                <div className="match static-match">
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
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">Aucun match confirmé.</p>
        )}
      </section>
    </div>
  );
}
