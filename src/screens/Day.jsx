import { useEffect, useMemo, useState } from "react";
import {
  activeSeason,
  computeRatings,
  matchTotals,
  rotateFrom,
  suggestRound,
  timesTogether,
} from "../logic";
import { dayShareText, formatDay, formatScore, formatWhen, shareOrCopy } from "../format";
import { uid, useStore } from "../store";
import { Avatar, BackHeader } from "../ui";

export default function Day({ leagueId, sessionId, open, back }) {
  const store = useStore();
  const { state } = store;
  const league = state.leagues.find((item) => item.id === leagueId);
  const season = activeSeason(state.seasons || [], leagueId);
  const members = state.players
    .filter((player) => player.leagueId === leagueId)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const existing = (state.sessions || []).find((session) => session.id === sessionId) || null;

  const [present, setPresent] = useState(() =>
    existing?.presentPlayerIds?.length ? existing.presentPlayerIds.slice() : members.map((player) => player.id)
  );
  const [tweaks, setTweaks] = useState({});
  const [shareNote, setShareNote] = useState("");
  const [date] = useState(existing?.date || new Date().toISOString());

  useEffect(() => {
    if (!sessionId || existing || !league) return;
    store.saveSession({
      id: sessionId,
      leagueId,
      seasonId: season?.id || null,
      date,
      presentPlayerIds: present,
      matchIds: [],
    });
    // Intentionally once per new session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const seasonMatches = useMemo(
    () => state.matches.filter((match) => !season || match.seasonId === season.id),
    [state.matches, season]
  );
  const pack = useMemo(() => computeRatings(state.players, state.matches), [state.players, state.matches]);
  const names = Object.fromEntries(state.players.map((player) => [player.id, player.name]));

  const presentPlayers = members.filter((player) => present.includes(player.id));
  const sessionMatches = existing
    ? state.matches.filter((match) => existing.matchIds.includes(match.id))
    : [];
  const planned = sessionMatches.filter((match) => match.status === "planned");
  const played = sessionMatches
    .filter((match) => match.status === "played")
    .sort((a, b) => (b.playedAt || "").localeCompare(a.playedAt || ""));

  const suggestion =
    planned.length || presentPlayers.length < 4
      ? null
      : suggestRound(presentPlayers, seasonMatches, pack.rating);

  if (!league) {
    return (
      <div className="stack">
        <BackHeader onBack={back} title="Journée introuvable" />
      </div>
    );
  }

  function toggle(id) {
    setPresent((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function persistSession(extra = {}) {
    const id = existing?.id || sessionId || uid();
    const session = {
      id,
      leagueId,
      seasonId: season?.id || null,
      date,
      presentPlayerIds: present,
      matchIds: existing?.matchIds || [],
      ...extra,
    };
    store.saveSession(session);
    return session;
  }

  function plan() {
    if (!suggestion) return;
    const session = persistSession();
    store.planRound(
      leagueId,
      suggestion.fixtures.map((fixture, index) => {
        const lineup = rotateFrom(fixture.teamA, fixture.teamB, tweaks[index] || 0);
        return { id: uid(), teamA: lineup.teamA, teamB: lineup.teamB };
      }),
      { sessionId: session.id, seasonId: season?.id }
    );
    setTweaks({});
  }

  function openScore(teamA, teamB, matchId) {
    const session = persistSession();
    open({
      name: "match",
      leagueId,
      matchId,
      preset: { teamA, teamB },
      sessionId: session.id,
      seasonId: season?.id,
    });
  }

  async function share() {
    const session = persistSession();
    const fixtures =
      planned.length || played.length
        ? [...planned, ...played]
        : (suggestion?.fixtures || []).map((fixture, index) => rotateFrom(fixture.teamA, fixture.teamB, tweaks[index] || 0));
    const text = dayShareText({
      leagueName: league.name,
      date: session.date,
      names,
      matches: planned.length || played.length ? [...planned, ...played] : null,
      fixtures,
      resting: suggestion?.resting || members.filter((player) => !present.includes(player.id)),
    });
    const result = await shareOrCopy(text, `Tourne — ${league.name}`);
    if (result.mode === "copy") setShareNote("Copié.");
    else if (result.mode === "share") setShareNote("Partagé.");
    else if (result.mode === "fail") setShareNote("Impossible de partager.");
    else setShareNote("");
  }

  function labelPair(a, b) {
    const count = timesTogether(seasonMatches, a, b);
    if (!count) return "jamais ensemble";
    return count === 1 ? "déjà 1 fois" : `déjà ${count} fois`;
  }

  return (
    <div className="stack">
      <BackHeader onBack={back} title="Journée" sub={`${league.name}${season ? ` · ${season.name}` : ""}`} />

      <section className="section stack">
        <p className="eyebrow">{formatDay(date)}</p>
        <h2>Présents</h2>
        <p className="note">Coche qui joue. La rotation et le niveau ne regardent que ceux-là.</p>
        <div className="chips">
          {members.map((player) => {
            const on = present.includes(player.id);
            return (
              <button key={player.id} type="button" className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => toggle(player.id)}>
                <Avatar id={player.id} name={player.name} size="sm" />
                {player.name}
              </button>
            );
          })}
        </div>
        <p className="meta">{present.length} présent{present.length > 1 ? "s" : ""} · {Math.floor(present.length / 4)} terrain{Math.floor(present.length / 4) > 1 ? "s" : ""}</p>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={() => setPresent(members.map((player) => player.id))}>
            Tous
          </button>
          <button type="button" className="btn btn-small" onClick={() => setPresent([])}>
            Aucun
          </button>
          <button type="button" className="btn btn-small" onClick={() => persistSession()}>
            Enregistrer les présents
          </button>
        </div>
      </section>

      {presentPlayers.length < 4 ? (
        <section className="section">
          <p className="note">Il faut au moins 4 présents pour composer un match.</p>
        </section>
      ) : null}

      {planned.length ? (
        <section className="section stack">
          <h2>Terrains prévus</h2>
          {planned.map((match) => (
            <article key={match.id} className="fixture">
              <span className="tag">Prévu</span>
              <PairLine names={names} team={match.teamA} hint={labelPair(match.teamA[0], match.teamA[1])} fresh={!timesTogether(seasonMatches, match.teamA[0], match.teamA[1])} />
              <span className="vs">contre</span>
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
          <button type="button" className="btn" onClick={() => store.cancelPlanned(leagueId, existing?.id)}>
            Annuler la journée prévue
          </button>
        </section>
      ) : null}

      {suggestion?.fixtures?.length ? (
        <section className="section stack">
          <h2>Proposition</h2>
          <p className="note">Nouvelles paires en priorité, équipes équilibrées sur le niveau.</p>
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
            <p className="rest">Repos : {suggestion.resting.map((player) => player.name).join(", ")}</p>
          ) : (
            <p className="rest">Tout le monde joue.</p>
          )}
          <button type="button" className="btn btn-primary" onClick={plan}>
            Prévoir cette journée
          </button>
        </section>
      ) : null}

      {played.length ? (
        <section className="section stack">
          <h2>Scores du jour</h2>
          <ul className="matches">
            {played.map((match) => {
              const totals = matchTotals(match.sets);
              return (
                <li key={match.id}>
                  <button type="button" className="match" onClick={() => open({ name: "match", leagueId, matchId: match.id, sessionId: existing?.id, seasonId: season?.id })}>
                    <span className="match-teams">
                      <span className={totals.winner === "A" ? "win-name" : ""}>
                        {names[match.teamA[0]]} + {names[match.teamA[1]]}
                      </span>
                      <span className={totals.winner === "B" ? "win-name" : ""}>
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
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="row">
        <button type="button" className="btn" onClick={share}>
          Partager la journée
        </button>
      </div>
      {shareNote ? <p className="note">{shareNote}</p> : null}
    </div>
  );
}

function PairLine({ names, team, hint, fresh }) {
  return (
    <p className="pair-line">
      <span>
        {names[team[0]]} + {names[team[1]]}
      </span>
      {hint ? <small className={fresh ? "fresh" : ""}>{hint}</small> : null}
    </p>
  );
}
