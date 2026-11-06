import { useMemo, useState } from "react";
import { canSave, matchTotals, rotateFrom, timesTogether } from "../logic";
import { useStore, uid } from "../store";
import { Avatar, BackHeader } from "../ui";

const PRESETS = [
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 0],
  [7, 5],
  [7, 6],
];

export default function Match({ leagueId, matchId, preset, sessionId, seasonId, back }) {
  const store = useStore();
  const { state } = store;
  const existing = state.matches.find((match) => match.id === matchId) || null;
  const league = state.leagues.find((item) => item.id === leagueId);
  const initialPicked = existing
    ? [...existing.teamA, ...existing.teamB]
    : preset?.teamA && preset?.teamB
      ? [...preset.teamA, ...preset.teamB]
      : [];

  const [picked, setPicked] = useState(initialPicked);
  const [rot, setRot] = useState(0);
  const [sets, setSets] = useState(
    existing?.sets?.length === 3
      ? existing.sets.map((set) => ({ a: set.a, b: set.b }))
      : [
          { a: 0, b: 0 },
          { a: 0, b: 0 },
          { a: 0, b: 0 },
        ]
  );
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [playedAt, setPlayedAt] = useState(() => toLocalInput(existing?.playedAt || new Date().toISOString()));

  const roster = state.players
    .filter((player) => player.leagueId === leagueId || picked.includes(player.id))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const names = Object.fromEntries(state.players.map((player) => [player.id, player.name]));

  const lineup = useMemo(() => {
    if (picked.length !== 4) return null;
    return rotateFrom([picked[0], picked[1]], [picked[2], picked[3]], rot);
  }, [picked, rot]);

  function toggle(id) {
    setRot(0);
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  function updateSet(index, side, value) {
    const next = Number(value);
    if (!Number.isInteger(next)) return;
    setSets((current) => current.map((set, setIndex) => (setIndex === index ? { ...set, [side]: Math.max(0, Math.min(15, next)) } : set)));
  }

  function applyPreset(scores) {
    setSets((current) => current.map((set, index) => (index === active ? { a: scores[0], b: scores[1] } : set)));
    setActive((current) => (current < 2 ? current + 1 : current));
  }

  function save() {
    if (!lineup) {
      setError("Choisis quatre joueurs.");
      return;
    }
    const when = fromLocalInput(playedAt) || new Date().toISOString();
    const match = {
      id: existing?.id || uid(),
      leagueId,
      seasonId: existing?.seasonId || seasonId || null,
      sessionId: existing?.sessionId || sessionId || null,
      status: "played",
      teamA: lineup.teamA,
      teamB: lineup.teamB,
      sets: sets.map((set) => ({ a: Number(set.a), b: Number(set.b) })),
      createdAt: existing?.createdAt || new Date().toISOString(),
      playedAt: when,
    };
    const problem = canSave(match);
    if (problem) {
      setError(problem);
      return;
    }
    store.saveMatch(match);
    if (sessionId || existing?.sessionId) {
      const sid = sessionId || existing.sessionId;
      const session = (state.sessions || []).find((item) => item.id === sid);
      if (session && !session.matchIds.includes(match.id)) {
        store.saveSession({ ...session, matchIds: [...session.matchIds, match.id] });
      }
    }
    back();
  }

  function remove() {
    if (!existing) return;
    if (window.confirm("Supprimer ce match ? Les niveaux seront recalculés.")) {
      store.deleteMatch(existing.id);
      back();
    }
  }

  const totals = matchTotals(sets);
  const ready = lineup && !canSave({ teamA: lineup.teamA, teamB: lineup.teamB, sets });
  const togetherA = lineup ? timesTogether(state.matches.filter((match) => match.id !== existing?.id), lineup.teamA[0], lineup.teamA[1]) : 0;
  const togetherB = lineup ? timesTogether(state.matches.filter((match) => match.id !== existing?.id), lineup.teamB[0], lineup.teamB[1]) : 0;

  return (
    <div className="stack">
      <BackHeader onBack={back} title={existing?.status === "played" ? "Modifier le match" : "Nouveau match"} sub={league?.name || "Ligue"} />

      <section className="section stack">
        <div className="section-head">
          <h2>Les quatre</h2>
          <span className="meta">{picked.length}/4</span>
        </div>
        <div className="chips">
          {roster.map((player) => {
            const on = picked.includes(player.id);
            return (
              <button
                key={player.id}
                type="button"
                className={on ? "chip on" : "chip"}
                aria-pressed={on}
                disabled={!on && picked.length >= 4}
                onClick={() => toggle(player.id)}
              >
                <Avatar id={player.id} name={player.name} size="sm" />
                {player.name}
              </button>
            );
          })}
        </div>
        {!roster.length ? <p className="note">Ajoute d'abord des joueurs dans la ligue.</p> : null}
      </section>

      {lineup ? (
        <section className="board">
          <Side names={names} players={state.players} ids={lineup.teamA} sets={sets} side="a" winner={ready && totals.winner === "A"} hint={togetherA ? `ensemble ${togetherA} fois` : "jamais ensemble"} />
          <p className="vs">contre</p>
          <Side names={names} players={state.players} ids={lineup.teamB} sets={sets} side="b" winner={ready && totals.winner === "B"} hint={togetherB ? `ensemble ${togetherB} fois` : "jamais ensemble"} />
          <button type="button" className="btn" onClick={() => setRot((value) => value + 1)}>
            Tourner les partenaires
          </button>
          <p className="note">Mêmes quatre joueurs, autres paires. Les 3 répartitions passent chacune leur tour.</p>
        </section>
      ) : null}

      {lineup ? (
        <section className="section stack">
          <h2>3 sets</h2>
          <div className="sets">
            {sets.map((set, index) => (
              <div key={index} className={index === active ? "set on" : "set"}>
                <button type="button" className="set-label" onClick={() => setActive(index)}>
                  Set {index + 1}
                </button>
                <div className="set-line">
                  <span>
                    {names[lineup.teamA[0]]} + {names[lineup.teamA[1]]}
                  </span>
                  <Stepper label={`Set ${index + 1}, ${names[lineup.teamA[0]]} et ${names[lineup.teamA[1]]}`} value={set.a} onChange={(value) => updateSet(index, "a", value)} />
                </div>
                <div className="set-line">
                  <span>
                    {names[lineup.teamB[0]]} + {names[lineup.teamB[1]]}
                  </span>
                  <Stepper label={`Set ${index + 1}, ${names[lineup.teamB[0]]} et ${names[lineup.teamB[1]]}`} value={set.b} onChange={(value) => updateSet(index, "b", value)} />
                </div>
              </div>
            ))}
          </div>
          <div className="presets">
            {PRESETS.map((presetScore) => (
              <button key={presetScore.join("-")} type="button" className="chip" onClick={() => applyPreset(presetScore)}>
                {presetScore[0]}-{presetScore[1]}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => setSets((current) => current.map((set, index) => (index === active ? { a: set.b, b: set.a } : set)))}
            >
              Inverser
            </button>
          </div>
          <label className="field">
            Date du match
            <input type="datetime-local" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} />
          </label>
          <p className="note">Les 3 sets se jouent, même à 2-0. L'écart de niveau suit les jeux.</p>
          {ready ? (
            <p className="verdict" aria-live="polite">
              {(totals.winner === "A" ? lineup.teamA : lineup.teamB).map((id) => names[id]).join(" et ")} gagnent{" "}
              {totals.winner === "A" ? `${totals.setsA}-${totals.setsB}` : `${totals.setsB}-${totals.setsA}`},{" "}
              {totals.winner === "A" ? `${totals.gamesA}-${totals.gamesB}` : `${totals.gamesB}-${totals.gamesA}`} en jeux.
            </p>
          ) : (
            <p className="note">Chaque set doit avoir un vainqueur.</p>
          )}
          {error ? <p className="error">{error}</p> : null}
          <button type="button" className="btn btn-primary btn-block" disabled={!ready} onClick={save}>
            {existing?.status === "played" ? "Mettre à jour" : "Enregistrer le match"}
          </button>
          {existing ? (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Supprimer le match
            </button>
          ) : null}
        </section>
      ) : (
        <p className="note">Choisis quatre joueurs pour entrer les 3 sets.</p>
      )}
    </div>
  );
}

function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function Side({ names, players, ids, sets, side, winner, hint }) {
  return (
    <div className={winner ? "side win" : "side"}>
      <div>
        {ids.map((id) => {
          const player = players.find((item) => item.id === id);
          return (
            <p key={id} className="side-name">
              <Avatar id={id} name={names[id]} size="sm" />
              {player?.name || names[id]}
            </p>
          );
        })}
        <small className={hint.startsWith("jamais") ? "fresh" : ""}>{hint}</small>
      </div>
      <p className="side-sets">
        {sets.map((set, index) => (
          <span key={index}>{side === "a" ? set.a : set.b}</span>
        ))}
      </p>
    </div>
  );
}

function Stepper({ value, onChange, label }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Retirer un jeu, ${label}`} onClick={() => onChange(value - 1)}>
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "");
          onChange(digits === "" ? 0 : Number(digits));
        }}
      />
      <button type="button" aria-label={`Ajouter un jeu, ${label}`} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
