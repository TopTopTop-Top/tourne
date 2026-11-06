import { useMemo, useState } from "react";
import {
  activeSeason,
  computeRatings,
  matchTotals,
  matchesForSeason,
  opponentRows,
  partnerRows,
  playerRecord,
  ratingHistory,
  reliability,
  rotationReadings,
} from "../logic";
import { formatDelta, formatScore, formatWhen } from "../format";
import { useStore } from "../store";
import { Avatar, BackHeader, FormDots, RateBar, Sparkline } from "../ui";

export default function Player({ playerId, open, back }) {
  const store = useStore();
  const { state } = store;
  const player = state.players.find((item) => item.id === playerId);
  const [name, setName] = useState(player?.name || "");
  const [error, setError] = useState("");
  const [partnerFilter, setPartnerFilter] = useState(null);
  const [scope, setScope] = useState("season");

  const season = player ? activeSeason(state.seasons || [], player.leagueId) : null;
  const scopedMatches = useMemo(() => {
    if (!player) return [];
    if (scope === "all" || !season) return state.matches;
    return matchesForSeason(state.matches, season.id);
  }, [player, scope, season, state.matches]);

  const pack = useMemo(() => computeRatings(state.players, state.matches), [state.players, state.matches]);
  const history = useMemo(
    () => (player ? ratingHistory(player.id, scopedMatches) : []),
    [player, scopedMatches]
  );

  if (!player) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Joueur introuvable" />
      </div>
    );
  }

  const league = state.leagues.find((item) => item.id === player.leagueId);
  const mates = state.players.filter((item) => item.leagueId === player.leagueId && playerRecord(item.id, state.matches).played > 0);
  const average = mates.length ? mates.reduce((sum, item) => sum + pack.rating[item.id], 0) / mates.length : null;
  const record = playerRecord(player.id, scopedMatches);
  const partners = partnerRows(player.id, scopedMatches);
  const foes = opponentRows(player.id, scopedMatches);
  const rel = reliability(record.played);
  const names = Object.fromEntries(state.players.map((item) => [item.id, item.name]));
  const readings = rotationReadings(
    state.players.filter((item) => item.leagueId === player.leagueId),
    scopedMatches
  );
  const contrast = readings.contrasts.find((item) => item.playerId === player.id);
  const steady = readings.steadys.find((item) => item.playerId === player.id);
  const gap = average == null ? null : Math.round(pack.rating[player.id] - average);
  const visibleMatches = partnerFilter
    ? record.matches.filter((match) => {
        const side = match.teamA.includes(player.id) ? match.teamA : match.teamB;
        return side.includes(partnerFilter);
      })
    : record.matches;
  const seasonDelta =
    history.length > 1 ? Math.round(history[history.length - 1].rating - history[0].rating) : null;

  function saveName(event) {
    event.preventDefault();
    const result = store.renamePlayer(player.id, name);
    setError(result.error || "");
  }

  function remove() {
    const result = store.deletePlayer(player.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    back();
  }

  const leagues = state.leagues.slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "fr"));

  return (
    <div className="stack">
      <BackHeader onBack={back} title={player.name} sub={league ? league.name : "Sans ligue"} />

      <div className="seg" role="group" aria-label="Période">
        <button type="button" aria-pressed={scope === "season"} onClick={() => setScope("season")} disabled={!season}>
          {season?.name || "Saison"}
        </button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
          Tout
        </button>
      </div>

      <section className="section hero-player">
        <Avatar id={player.id} name={player.name} size="lg" />
        <div>
          <p className="eyebrow">Niveau</p>
          <p className="niveau">{Math.round(pack.rating[player.id])}</p>
          <p className="meta">
            {gap == null ? "Départ 1000" : `${gap > 0 ? "+" : ""}${gap} vs la ligue`}
            {pack.lastDelta[player.id] != null ? ` · dernier match ${formatDelta(pack.lastDelta[player.id])}` : ""}
          </p>
          <span className={`pill ${rel.key}`}>{rel.label}</span>
        </div>
      </section>

      {history.length > 1 ? (
        <section className="section stack">
          <div className="section-head">
            <h2>Historique</h2>
            {seasonDelta != null ? <span className={seasonDelta >= 0 ? "up" : "down"}>{formatDelta(seasonDelta)}</span> : null}
          </div>
          <Sparkline points={history} />
          <p className="note">
            De {Math.round(history[0].rating)} à {Math.round(history[history.length - 1].rating)}
            {scope === "season" && season ? ` sur ${season.name}` : " au total"}.
          </p>
        </section>
      ) : null}

      <section className="section stats-grid">
        <Stat label="Victoires" value={`${record.wins}-${record.losses}`} />
        <Stat label="Sets" value={`${record.setsFor}-${record.setsAgainst}`} />
        <Stat label="Jeux" value={`${record.gamesFor}-${record.gamesAgainst}`} />
        <Stat label="Matchs" value={String(record.played)} extra={<FormDots form={record.form} />} />
      </section>

      {contrast || steady ? (
        <section className="section">
          <h2>Lecture</h2>
          <p className="reading static">{contrast ? contrast.text : steady.text}</p>
        </section>
      ) : (
        <section className="section">
          <h2>Lecture</h2>
          <p className="note">Il faut au moins deux partenaires différents pour savoir si le niveau est le sien, ou celui de la paire.</p>
        </section>
      )}

      <section className="section stack">
        <h2>Avec</h2>
        {partners.length ? (
          partners.map((row) => (
            <button
              key={row.partnerId}
              type="button"
              className={partnerFilter === row.partnerId ? "duo on" : "duo"}
              onClick={() => setPartnerFilter((current) => (current === row.partnerId ? null : row.partnerId))}
            >
              <span className="duo-name">{names[row.partnerId]}</span>
              <RateBar gamesFor={row.gamesFor} gamesAgainst={row.gamesAgainst} />
              <span className="duo-rec">
                {row.wins}V-{row.losses}D · {row.gamesFor}-{row.gamesAgainst}
              </span>
            </button>
          ))
        ) : (
          <p className="note">Pas encore de partenaire.</p>
        )}
      </section>

      <section className="section stack">
        <h2>En face</h2>
        {foes.length ? (
          foes.map((row) => (
            <div key={row.partnerId} className="duo static">
              <span className="duo-name">{names[row.partnerId]}</span>
              <RateBar gamesFor={row.gamesFor} gamesAgainst={row.gamesAgainst} />
              <span className="duo-rec">
                {row.wins}V-{row.losses}D · {row.gamesFor}-{row.gamesAgainst}
              </span>
            </div>
          ))
        ) : (
          <p className="note">Pas encore d'adversaire.</p>
        )}
      </section>

      <section className="section">
        <h2>{partnerFilter ? `Matchs avec ${names[partnerFilter]}` : "Matchs"}</h2>
        {visibleMatches.length ? (
          <ul className="matches">
            {[...visibleMatches].reverse().map((match) => {
              const side = match.teamA.includes(player.id) ? "A" : "B";
              const totals = matchTotals(match.sets);
              const won = totals.winner === side;
              return (
                <li key={match.id}>
                  <button type="button" className="match" onClick={() => open({ name: "match", leagueId: match.leagueId, matchId: match.id })}>
                    <span className="match-teams">
                      <span>
                        {names[match.teamA[0]]} + {names[match.teamA[1]]}
                      </span>
                      <span>
                        {names[match.teamB[0]]} + {names[match.teamB[1]]}
                      </span>
                    </span>
                    <span className="match-score">
                      <b className={won ? "up" : "down"}>{won ? "Gagné" : "Perdu"}</b>
                      <span>{formatScore(match.sets)}</span>
                    </span>
                    <time>{formatWhen(match.playedAt)}</time>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">Aucun match.</p>
        )}
      </section>

      <section className="section stack">
        <h2>Identité</h2>
        {state.identity && player.identityId === state.identity.id ? (
          <p className="note">C'est toi. Tes stats globales sont dans Mon identité.</p>
        ) : state.identity ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const result = store.claimPlayer(player.id);
              setError(result.error || "");
            }}
          >
            C'est moi
          </button>
        ) : (
          <p className="note">Crée d'abord ton identité depuis l'accueil.</p>
        )}
      </section>

      <details className="fold">
        <summary>Fiche</summary>
        <form className="stack" onSubmit={saveName}>
          <label className="field">
            Nom
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            Ligue
            <select value={player.leagueId} onChange={(event) => store.movePlayer(player.id, event.target.value)}>
              {leagues.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="row">
            <button type="submit" className="btn btn-small">
              Renommer
            </button>
            <button type="button" className="btn btn-small btn-danger" onClick={remove}>
              Retirer
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function Stat({ label, value, extra }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {extra}
    </div>
  );
}
