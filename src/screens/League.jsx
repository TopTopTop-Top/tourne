import { useEffect, useMemo, useState } from "react";
import {
  activeSeason,
  closedSeasons,
  computeRatings,
  duoRecord,
  fullRotation,
  leagueAdvice,
  matchTotals,
  matchesForSeason,
  missingPartnerships,
  pairCoverage,
  playerRecord,
  reliability,
  rotationReadings,
  seasonStanding,
  suggestRound,
  timesTogether,
  rotateFrom,
} from "../logic";
import { formatDelta, formatScore, formatWhen, heatStyle, shareOrCopy, standingShareText } from "../format";
import { uid, useStore } from "../store";
import { Avatar, BackHeader, FormDots, Meter } from "../ui";

export default function League({ leagueId, open, back }) {
  const store = useStore();
  const { state } = store;
  const league = state.leagues.find((item) => item.id === leagueId);
  const [playerName, setPlayerName] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [leagueName, setLeagueName] = useState(league?.name || "");
  const [tier, setTier] = useState(league?.tier || 1);
  const [leagueError, setLeagueError] = useState("");
  const [tweaks, setTweaks] = useState({});
  const [mode, setMode] = useState("with");
  const [pair, setPair] = useState(null);
  const [shareNote, setShareNote] = useState("");
  const [archiveId, setArchiveId] = useState(null);

  useEffect(() => {
    if (!pair) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPair(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pair]);

  const pack = useMemo(
    () => computeRatings(state.players, state.matches),
    [state.players, state.matches]
  );

  if (!league) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Ligue introuvable" />
      </div>
    );
  }

  const season = activeSeason(state.seasons || [], league.id);
  const archives = closedSeasons(state.seasons || [], league.id);
  const seasonMatches = season ? matchesForSeason(state.matches, season.id) : state.matches.filter((match) => match.leagueId === league.id);
  const members = state.players
    .filter((player) => player.leagueId === league.id)
    .sort((a, b) => pack.rating[b.id] - pack.rating[a.id] || a.name.localeCompare(b.name, "fr"));
  const played = seasonMatches
    .filter((match) => match.status === "played")
    .sort((a, b) => (b.playedAt || "").localeCompare(a.playedAt || ""));
  const planned = state.matches.filter(
    (match) => match.leagueId === league.id && match.status === "planned" && (!season || match.seasonId === season.id)
  );
  const activeMembers = members.filter((player) => playerRecord(player.id, state.matches).played > 0);
  const levels = activeMembers.map((player) => pack.rating[player.id]);
  const spread = levels.length ? `${Math.round(Math.min(...levels))} à ${Math.round(Math.max(...levels))}` : null;
  const withCoverage = pairCoverage(members, seasonMatches, "with");
  const againstCoverage = pairCoverage(members, seasonMatches, "against");
  const readings = rotationReadings(members, seasonMatches);
  const advice = leagueAdvice(league, state.leagues, state.players, seasonMatches, pack.rating);
  const suggestion = planned.length ? null : suggestRound(members, seasonMatches, pack.rating);
  const cycle = fullRotation(members, seasonMatches);
  const missing = missingPartnerships(members, seasonMatches);
  const names = Object.fromEntries(state.players.map((player) => [player.id, player.name]));
  const standing = seasonStanding(members, seasonMatches, pack.rating);
  const archive = archives.find((item) => item.id === archiveId) || archives[0] || null;

  function labelPair(a, b) {
    const count = timesTogether(seasonMatches, a, b);
    if (!count) return "jamais ensemble";
    return count === 1 ? "déjà 1 fois" : `déjà ${count} fois`;
  }

  function addPlayer(event) {
    event.preventDefault();
    const result = store.addPlayer(league.id, playerName);
    if (result.error) {
      setPlayerError(result.error);
      return;
    }
    setPlayerName("");
    setPlayerError("");
  }

  function saveLeague(event) {
    event.preventDefault();
    const result = store.updateLeague(league.id, leagueName, tier);
    setLeagueError(result.error || "");
  }

  function removeLeague() {
    const result = store.deleteLeague(league.id);
    if (result.error) {
      setLeagueError(result.error);
      return;
    }
    back();
  }

  function plan() {
    if (!suggestion) return;
    store.planRound(
      league.id,
      suggestion.fixtures.map((fixture, index) => {
        const lineup = rotateFrom(fixture.teamA, fixture.teamB, tweaks[index] || 0);
        return { id: uid(), teamA: lineup.teamA, teamB: lineup.teamB };
      }),
      { seasonId: season?.id }
    );
    setTweaks({});
  }

  function openScore(teamA, teamB, matchId) {
    open({ name: "match", leagueId: league.id, matchId, preset: { teamA, teamB }, seasonId: season?.id });
  }

  function closeSeason() {
    if (!season) return;
    if (!window.confirm(`Clôturer ${season.name} et en démarrer une nouvelle ? Le niveau est conservé.`)) return;
    store.closeSeason(league.id, season.id, standing);
  }

  async function shareStanding() {
    const text = standingShareText({
      leagueName: league.name,
      seasonName: season?.name || "Saison",
      rows: standing,
    });
    const result = await shareOrCopy(text, `Tourne — ${league.name}`);
    if (result.mode === "copy") setShareNote("Classement copié.");
    else if (result.mode === "share") setShareNote("Classement partagé.");
    else if (result.mode === "fail") setShareNote("Impossible de partager.");
  }

  function undoLast() {
    if (!window.confirm("Annuler le dernier match joué de cette ligue ?")) return;
    store.undoLastMatch(league.id);
  }

  const shownContrasts = readings.contrasts.slice(0, 3);
  const shownSteadys = readings.steadys.filter((item) => !shownContrasts.some((contrast) => contrast.playerId === item.playerId)).slice(0, 2);

  return (
    <div className="stack">
      <BackHeader
        onBack={back}
        title={league.name}
        sub={`${members.length} joueur${members.length > 1 ? "s" : ""}${spread ? ` · niveau ${spread}` : ""}${season ? ` · ${season.name}` : ""}`}
      />

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => open({ name: "day", leagueId: league.id, sessionId: uid() })}>
          Ouvrir la journée
        </button>
        <button type="button" className="btn" onClick={() => open({ name: "match", leagueId: league.id, seasonId: season?.id })}>
          Nouveau match
        </button>
      </div>

      <section className="section stack">
        <div className="section-head">
          <h2>{season?.name || "Saison"}</h2>
          <button type="button" className="btn btn-small" onClick={shareStanding}>
            Partager
          </button>
        </div>
        <p className="note">Couverture des paires sur la saison. Le niveau (Elo) continue d'une saison à l'autre.</p>
        <Meter label="Partenaires croisés" done={withCoverage.done} total={withCoverage.total} />
        <Meter label="Adversaires croisés" done={againstCoverage.done} total={againstCoverage.total} />
        <p className="note">
          {withCoverage.total > 0 && withCoverage.done === withCoverage.total
            ? "Toutes les paires ont joué ensemble. Les prochains scores servent à affiner le niveau."
            : "Chaque paire encore vide sert à lire le niveau. Une large victoire ne veut rien dire tant que les quatre n'ont pas changé de partenaire."}
        </p>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={closeSeason} disabled={!season || !played.length}>
            Clôturer la saison
          </button>
          {played.length ? (
            <button type="button" className="btn btn-small" onClick={undoLast}>
              Annuler le dernier match
            </button>
          ) : null}
        </div>
        {shareNote ? <p className="note">{shareNote}</p> : null}
        {archives.length ? (
          <details className="fold">
            <summary>Saisons closes ({archives.length})</summary>
            <div className="row">
              {archives.map((item) => (
                <button key={item.id} type="button" className={archive?.id === item.id ? "chip on" : "chip"} onClick={() => setArchiveId(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
            {archive?.standing?.length ? (
              <ol className="ladder compact">
                {archive.standing.map((row, index) => (
                  <li key={row.id}>
                    <span className="rank static">
                      <span className="pos">{index + 1}</span>
                      <span className="rank-main">
                        <strong>{row.name}</strong>
                        <span className="meta">{row.wins}V-{row.losses}D</span>
                      </span>
                      <span className="rank-score">
                        <b>{Math.round(row.rating)}</b>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="note">Classement non archivé pour cette saison.</p>
            )}
          </details>
        ) : null}
      </section>

      <section className="section stack">
        <h2>Ce que la rotation dit</h2>
        {shownContrasts.length || shownSteadys.length ? (
          <>
            {shownContrasts.map((item) => (
              <button key={item.playerId} type="button" className="reading" onClick={() => open({ name: "player", playerId: item.playerId })}>
                {item.text}
              </button>
            ))}
            {shownSteadys.map((item) => (
              <button key={item.playerId} type="button" className="reading steady" onClick={() => open({ name: "player", playerId: item.playerId })}>
                {item.text}
              </button>
            ))}
          </>
        ) : (
          <p className="note">Pas encore assez de croisements. Fais jouer les mêmes quatre avec d'autres partenaires.</p>
        )}
      </section>

      {advice.length ? (
        <section className="section stack">
          <h2>Niveau similaire</h2>
          {advice.map((tip) => (
            <article key={tip.playerId} className="advice">
              <p>{tip.text}</p>
              <div className="row">
                <button type="button" className="btn btn-small" onClick={() => open({ name: "player", playerId: tip.playerId })}>
                  Voir la fiche
                </button>
                {tip.targetId ? (
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    onClick={() => {
                      const target = state.leagues.find((item) => item.id === tip.targetId);
                      const verb = tip.direction === "up" ? "Monter" : "Descendre";
                      if (window.confirm(`${verb} ce joueur en ${target?.name || "l'autre ligue"} ?`)) {
                        store.movePlayer(tip.playerId, tip.targetId);
                      }
                    }}
                  >
                    {tip.direction === "up" ? "Faire monter" : "Faire descendre"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="section stack">
        <h2>Journée</h2>
        <p className="note">On propose d'abord les paires qui ne se sont jamais trouvées. Un joueur qui a moins joué, ou qui vient d'arriver, passe devant.</p>

        {members.length < 4 ? <p className="note">Il faut 4 joueurs dans la ligue pour faire un match.</p> : null}

        {cycle ? (
          <div className="stack tight">
            <p className="note">À quatre, la rotation complète tient en 3 matchs : chacun partenaire de chacun.</p>
            {cycle.map((part) => (
              <article key={`${part.teamA.join("-")}`} className="fixture">
                <PairLine names={names} team={part.teamA} hint={part.count ? `jouée ${part.count} fois` : "pas encore"} fresh={!part.count} />
                <PairLine names={names} team={part.teamB} />
                <button type="button" className="btn btn-small" onClick={() => openScore(part.teamA, part.teamB)}>
                  Saisir le score
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {planned.length ? (
          <div className="stack tight">
            <p className="note">Journée prévue. Entre les scores, ou annule pour proposer autre chose.</p>
            {planned.map((match) => (
              <article key={match.id} className="fixture">
                <span className="tag">Prévu</span>
                <PairLine names={names} team={match.teamA} hint={labelPair(match.teamA[0], match.teamA[1])} fresh={!timesTogether(seasonMatches, match.teamA[0], match.teamA[1])} />
                <PairLine names={names} team={match.teamB} hint={labelPair(match.teamB[0], match.teamB[1])} fresh={!timesTogether(seasonMatches, match.teamB[0], match.teamB[1])} />
                <div className="row">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => openScore(match.teamA, match.teamB, match.id)}>
                    Saisir le score
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => store.deleteMatch(match.id)}>
                    Retirer
                  </button>
                </div>
              </article>
            ))}
            <button type="button" className="btn" onClick={() => store.cancelPlanned(league.id)}>
              Annuler la journée
            </button>
          </div>
        ) : null}

        {suggestion && suggestion.fixtures.length && !cycle ? (
          <div className="stack tight">
            {suggestion.fixtures.map((fixture, index) => {
              const lineup = rotateFrom(fixture.teamA, fixture.teamB, tweaks[index] || 0);
              return (
                <article key={`${lineup.teamA.join("-")}-${index}`} className="fixture">
                  <PairLine names={names} team={lineup.teamA} hint={labelPair(lineup.teamA[0], lineup.teamA[1])} fresh={!timesTogether(seasonMatches, lineup.teamA[0], lineup.teamA[1])} />
                  <span className="vs">contre</span>
                  <PairLine names={names} team={lineup.teamB} hint={labelPair(lineup.teamB[0], lineup.teamB[1])} fresh={!timesTogether(seasonMatches, lineup.teamB[0], lineup.teamB[1])} />
                  <div className="row">
                    <button type="button" className="btn btn-small" onClick={() => setTweaks((current) => ({ ...current, [index]: (current[index] || 0) + 1 }))}>
                      Tourner
                    </button>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => openScore(lineup.teamA, lineup.teamB)}>
                      Saisir le score
                    </button>
                  </div>
                </article>
              );
            })}
            {suggestion.resting.length ? (
              <p className="rest">Pas sur le terrain : {suggestion.resting.map((player) => player.name).join(", ")}. La suivante les reprend en priorité.</p>
            ) : (
              <p className="rest">Tout le monde joue. {members.length} joueurs, {suggestion.fixtures.length} terrain{suggestion.fixtures.length > 1 ? "s" : ""}.</p>
            )}
            <button type="button" className="btn" onClick={plan}>
              Prévoir cette journée
            </button>
          </div>
        ) : null}

        {missing.length ? (
          <p className="note">
            {missing.length === 1
              ? `Plus qu'une paire jamais ensemble : ${missing[0][0].name} et ${missing[0][1].name}.`
              : `${missing.length} paires ne se sont jamais trouvées, dont ${missing.slice(0, 3).map((item) => `${item[0].name}–${item[1].name}`).join(", ")}.`}
          </p>
        ) : members.length >= 2 ? (
          <p className="note">Tout le monde a joué avec tout le monde. On peut recommencer : les scores affinent le niveau.</p>
        ) : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Classement</h2>
        </div>
        <p className="note">Le niveau part de 1000. Marque « C'est moi » sur ta fiche pour suivre tes stats partout.</p>
        <form className="add-row" onSubmit={addPlayer}>
          <input
            value={playerName}
            maxLength={24}
            placeholder="Ajouter un joueur"
            aria-label="Nom du joueur"
            onChange={(event) => setPlayerName(event.target.value)}
          />
          <button type="submit" className="btn btn-small">Ajouter</button>
        </form>
        {playerError ? <p className="error">{playerError}</p> : null}
        <ol className="ladder">
          {members.map((player, index) => {
            const record = playerRecord(player.id, seasonMatches);
            const rel = reliability(record.played);
            const delta = pack.lastDelta[player.id];
            const isMe = state.identity && player.identityId === state.identity.id;
            return (
              <li key={player.id}>
                <div className="rank-wrap">
                  <button type="button" className="rank" onClick={() => open({ name: "player", playerId: player.id })}>
                    <span className={`pos ${index === 0 ? "lead" : ""}`}>{index + 1}</span>
                    <Avatar id={player.id} name={player.name} />
                    <span className="rank-main">
                      <strong>{player.name}{isMe ? " · toi" : ""}</strong>
                      <span className="meta">
                        {record.played ? `${record.wins}V-${record.losses}D · sets ${record.setsFor}-${record.setsAgainst}` : "Pas encore de match"}
                        {record.played ? <FormDots form={record.form} /> : null}
                      </span>
                      <span className={`pill ${rel.key}`}>{rel.label}</span>
                    </span>
                    <span className="rank-score">
                      <b>{Math.round(pack.rating[player.id])}</b>
                      {delta != null ? <small className={delta >= 0 ? "up" : "down"} title="Variation au dernier match">{formatDelta(delta)}</small> : null}
                    </span>
                  </button>
                  {state.identity && !isMe ? (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        const result = store.claimPlayer(player.id);
                        if (result.error) setPlayerError(result.error);
                      }}
                    >
                      C'est moi
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {!members.length ? <p className="note">Ajoute les joueurs de la ligue.</p> : null}
      </section>

      <Matrix
        members={members}
        matches={seasonMatches}
        names={names}
        mode={mode}
        setMode={setMode}
        pair={pair}
        setPair={setPair}
        openMatch={(matchId) => open({ name: "match", leagueId: league.id, matchId, seasonId: season?.id })}
      />

      <section className="section">
        <h2>Scores</h2>
        {played.length ? (
          <ul className="matches">
            {played.map((match) => {
              const totals = matchTotals(match.sets);
              return (
                <li key={match.id}>
                  <button type="button" className="match" onClick={() => open({ name: "match", leagueId: league.id, matchId: match.id })}>
                    <span className="match-teams">
                      <span className={totals.winner === "A" ? "win-name" : ""}>
                        {names[match.teamA[0]]} + {names[match.teamA[1]]}
                      </span>
                      <span className={totals.winner === "B" ? "win-name" : ""}>
                        {names[match.teamB[0]]} + {names[match.teamB[1]]}
                      </span>
                    </span>
                    <span className="match-score">
                      <b>{totals.setsA}-{totals.setsB}</b>
                      <span>{formatScore(match.sets)}</span>
                    </span>
                    <time>{formatWhen(match.playedAt)}</time>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="note">Aucun score pour l'instant.</p>
        )}
      </section>

      <details className="fold">
        <summary>Modifier la ligue</summary>
        <form className="stack" onSubmit={saveLeague}>
          <label className="field">
            Nom
            <input value={leagueName} maxLength={32} onChange={(event) => setLeagueName(event.target.value)} />
          </label>
          <label className="field">
            Niveau
            <input type="number" min={1} max={20} value={tier} onChange={(event) => setTier(event.target.value)} />
          </label>
          {leagueError ? <p className="error">{leagueError}</p> : null}
          <div className="row">
            <button type="submit" className="btn btn-small">Enregistrer</button>
            <button type="button" className="btn btn-small btn-danger" onClick={removeLeague}>
              Supprimer
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function PairLine({ names, team, hint, fresh }) {
  return (
    <p className="pair-line">
      <span>{names[team[0]]} + {names[team[1]]}</span>
      {hint ? <small className={fresh ? "fresh" : ""}>{hint}</small> : null}
    </p>
  );
}

function Matrix({ members, matches, names, mode, setMode, pair, setPair, openMatch }) {
  const ordered = members.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const selected = pair ? duoRecord(pair.row, pair.col, matches, mode) : null;

  return (
    <section className="section stack">
      <div className="section-head">
        <h2>Paires</h2>
        <div className="seg" role="group" aria-label="Lecture de la matrice">
          <button type="button" aria-pressed={mode === "with"} onClick={() => { setMode("with"); setPair(null); }}>Ensemble</button>
          <button type="button" aria-pressed={mode === "against"} onClick={() => { setMode("against"); setPair(null); }}>En face</button>
        </div>
      </div>
      <p className="note">{mode === "with" ? "Victoires quand ces deux-là sont partenaires. La case vide n'a pas encore été jouée." : "Victoires du joueur de la ligne contre celui de la colonne."}</p>
      {ordered.length < 2 ? (
        <p className="note">La matrice apparaît à partir de deux joueurs.</p>
      ) : (
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="sticky" />
                {ordered.map((player) => (
                  <th key={player.id} title={player.name}>{player.name.slice(0, 1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr key={row.id}>
                  <th className="sticky">{row.name}</th>
                  {ordered.map((col) => {
                    if (row.id === col.id) return <td key={col.id} className="self" />;
                    const record = duoRecord(row.id, col.id, matches, mode);
                    const playedCount = record.wins + record.losses;
                    const style = heatStyle(record.gamesFor, record.gamesAgainst, playedCount);
                    return (
                      <td key={col.id}>
                        <button
                          type="button"
                          style={style}
                          className={playedCount ? "filled" : ""}
                          onClick={() => setPair({ row: row.id, col: col.id })}
                          aria-label={`${names[row.id]} ${mode === "with" ? "avec" : "contre"} ${names[col.id]}`}
                        >
                          {playedCount ? `${record.wins}-${record.losses}` : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pair && selected ? (
        <div className="sheet">
          <div className="sheet-top">
            <h3>{names[pair.row]} {mode === "with" ? "avec" : "contre"} {names[pair.col]}</h3>
            <button type="button" className="btn btn-small" onClick={() => setPair(null)}>Fermer</button>
          </div>
          {selected.wins + selected.losses ? (
            <>
              <p className="note">{selected.wins}V-{selected.losses}D · jeux {selected.gamesFor}-{selected.gamesAgainst}</p>
              <ul className="matches compact">
                {selected.matches.map((match) => (
                  <li key={match.id}>
                    <button type="button" className="match" onClick={() => openMatch(match.id)}>
                      <span className="match-teams">
                        <span>{names[match.teamA[0]]} + {names[match.teamA[1]]}</span>
                        <span>{names[match.teamB[0]]} + {names[match.teamB[1]]}</span>
                      </span>
                      <span className="match-score"><span>{formatScore(match.sets)}</span></span>
                      <time>{formatWhen(match.playedAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="note">{mode === "with" ? "Ils n'ont pas encore été partenaires." : "Ils ne se sont pas encore croisés en face."}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
