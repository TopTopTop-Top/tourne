import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import {
  addPlayer,
  claimPlayer,
  listValidations,
  loadLeagueBundle,
  voteMatch,
} from "../cloud";
import { computeRatings, matchTotals, playerRecord } from "../logic";
import { formatScore, formatWhen } from "../format";
import { Avatar, BackHeader } from "../ui";

export default function CloudLeague({ leagueId, open, back }) {
  const auth = useAuth();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setError("");
    try {
      setBundle(await loadLeagueBundle(leagueId));
    } catch (err) {
      setError(err.message || "Chargement impossible.");
    }
  }

  useEffect(() => {
    refresh();
  }, [leagueId]);

  const mapped = useMemo(() => {
    if (!bundle) return null;
    const players = bundle.players.map((player) => ({
      id: player.id,
      name: player.name,
      leagueId: player.league_id,
      userId: player.user_id,
    }));
    const matches = bundle.matches.map((match) => ({
      ...match,
      status: match.cloudStatus === "confirmed" ? "played" : match.status,
    }));
    const confirmed = matches.filter((match) => match.cloudStatus === "confirmed");
    const pack = computeRatings(players, confirmed);
    return { players, matches, confirmed, pack };
  }, [bundle]);

  if (error && !bundle) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Ligue" />
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!bundle || !mapped) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Ligue" />
        <p className="note">Chargement…</p>
      </div>
    );
  }

  const { league, members, seasons } = bundle;
  const season = seasons.find((item) => !item.closed_at) || seasons[0];
  const names = Object.fromEntries(mapped.players.map((player) => [player.id, player.name]));
  const ordered = mapped.players
    .slice()
    .sort((a, b) => mapped.pack.rating[b.id] - mapped.pack.rating[a.id] || a.name.localeCompare(b.name, "fr"));
  const pending = mapped.matches.filter((match) => match.cloudStatus === "proposed");
  const myPlayer = mapped.players.find((player) => player.userId === auth.user?.id);

  async function onAddPlayer(event) {
    event.preventDefault();
    try {
      await addPlayer(league.id, playerName);
      setPlayerName("");
      await refresh();
    } catch (err) {
      setError(err.message || "Ajout impossible.");
    }
  }

  async function onClaim(playerId) {
    try {
      await claimPlayer(playerId);
      await refresh();
    } catch (err) {
      setError(err.message || "Impossible de lier cette fiche.");
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(league.invite_code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <BackHeader onBack={back} title={league.name} sub={`Niveau ${league.tier}${season ? ` · ${season.name}` : ""}`} />

      <section className="section stack">
        <div className="section-head">
          <h2>Invitation</h2>
          <button type="button" className="btn btn-small" onClick={copyCode}>
            {copied ? "Copié" : "Copier le code"}
          </button>
        </div>
        <p className="invite-code">{league.invite_code}</p>
        <p className="note">{members.length} membre{members.length > 1 ? "s" : ""} connecté{members.length > 1 ? "s" : ""}.</p>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            open({
              name: "cloud-match",
              leagueId: league.id,
              seasonId: season?.id,
              players: mapped.players,
            })
          }
        >
          Proposer un score
        </button>
      </div>

      {pending.length ? (
        <section className="section stack">
          <h2>À valider</h2>
          <p className="note">Les 4 joueurs du match (comptes liés) approuvent ou refusent.</p>
          {pending.map((match) => (
            <PendingMatch
              key={match.id}
              match={match}
              names={names}
              players={mapped.players}
              me={auth.user?.id}
              onDone={refresh}
            />
          ))}
        </section>
      ) : null}

      <section className="section">
        <h2>Classement</h2>
        <p className="note">Seuls les scores confirmés comptent.</p>
        <form className="add-row" onSubmit={onAddPlayer}>
          <input value={playerName} maxLength={24} placeholder="Ajouter un joueur" onChange={(event) => setPlayerName(event.target.value)} />
          <button type="submit" className="btn btn-small">
            Ajouter
          </button>
        </form>
        <ol className="ladder">
          {ordered.map((player, index) => {
            const record = playerRecord(player.id, mapped.confirmed);
            return (
              <li key={player.id}>
                <div className="rank static">
                  <span className="pos">{index + 1}</span>
                  <Avatar id={player.id} name={player.name} />
                  <span className="rank-main">
                    <strong>{player.name}</strong>
                    <span className="meta">
                      {record.played ? `${record.wins}V-${record.losses}D` : "Pas encore de match"}
                      {player.userId ? " · lié" : ""}
                      {myPlayer?.id === player.id ? " · toi" : ""}
                    </span>
                    {!player.userId && !myPlayer ? (
                      <button type="button" className="btn btn-small" onClick={() => onClaim(player.id)}>
                        C'est moi
                      </button>
                    ) : null}
                  </span>
                  <span className="rank-score">
                    <b>{Math.round(mapped.pack.rating[player.id])}</b>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section">
        <h2>Scores confirmés</h2>
        {mapped.confirmed.length ? (
          <ul className="matches">
            {[...mapped.confirmed].reverse().map((match) => {
              const totals = matchTotals(match.sets);
              return (
                <li key={match.id}>
                  <div className="match static-match">
                    <span className="match-teams">
                      <span>
                        {names[match.teamA[0]]} + {names[match.teamA[1]]}
                      </span>
                      <span>
                        {names[match.teamB[0]]} + {names[match.teamB[1]]}
                      </span>
                    </span>
                    <span className="match-score">
                      <b>
                        {totals.setsA}-{totals.setsB}
                      </b>
                      <span>{formatScore(match.sets)}</span>
                    </span>
                    <time>{formatWhen(match.playedAt)}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">Aucun score confirmé.</p>
        )}
      </section>
    </div>
  );
}

function PendingMatch({ match, names, players, me, onDone }) {
  const [validations, setValidations] = useState([]);
  const [error, setError] = useState("");
  const four = [...match.teamA, ...match.teamB];
  const linked = players.filter((player) => four.includes(player.id) && player.userId);
  const canVote = linked.some((player) => player.userId === me);

  useEffect(() => {
    listValidations(match.id).then(setValidations).catch(() => setValidations([]));
  }, [match.id]);

  async function vote(choice) {
    setError("");
    try {
      await voteMatch(match.id, choice);
      await onDone();
    } catch (err) {
      setError(err.message || "Vote impossible.");
    }
  }

  const totals = match.sets?.length ? matchTotals(match.sets) : null;

  return (
    <article className="fixture">
      <span className="tag">À valider</span>
      <p className="pair-line">
        <span>
          {names[match.teamA[0]]} + {names[match.teamA[1]]}
        </span>
      </p>
      <span className="vs">contre</span>
      <p className="pair-line">
        <span>
          {names[match.teamB[0]]} + {names[match.teamB[1]]}
        </span>
      </p>
      {totals ? (
        <p className="note">
          {totals.setsA}-{totals.setsB} · {formatScore(match.sets)}
        </p>
      ) : null}
      <p className="note">
        Votes : {validations.filter((item) => item.vote === "approve").length} ok / {validations.filter((item) => item.vote === "reject").length} non
        {linked.length ? ` · ${linked.length} compte(s) parmi les 4` : " · aucun compte lié : un admin peut forcer plus tard"}
      </p>
      {canVote ? (
        <div className="row">
          <button type="button" className="btn btn-small btn-primary" onClick={() => vote("approve")}>
            Valider
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={() => vote("reject")}>
            Refuser
          </button>
        </div>
      ) : (
        <p className="note">Lie ta fiche joueur (« C'est moi ») pour pouvoir voter.</p>
      )}
      {error ? <p className="error">{error}</p> : null}
    </article>
  );
}
