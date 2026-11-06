import { useMemo, useState } from "react";
import { proposeMatch } from "../cloud";
import { canSave, rotateFrom } from "../logic";
import { Avatar, BackHeader } from "../ui";

const PRESETS = [
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 0],
  [7, 5],
  [7, 6],
];

export default function CloudMatch({ leagueId, seasonId, players, back }) {
  const [picked, setPicked] = useState([]);
  const [rot, setRot] = useState(0);
  const [sets, setSets] = useState([
    { a: 0, b: 0 },
    { a: 0, b: 0 },
    { a: 0, b: 0 },
  ]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const names = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const roster = players.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));

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

  async function save() {
    if (!lineup) {
      setError("Choisis quatre joueurs.");
      return;
    }
    const draft = {
      teamA: lineup.teamA,
      teamB: lineup.teamB,
      sets: sets.map((set) => ({ a: Number(set.a), b: Number(set.b) })),
    };
    const problem = canSave(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await proposeMatch({
        leagueId,
        seasonId,
        teamA: draft.teamA,
        teamB: draft.teamB,
        sets: draft.sets,
      });
      back();
    } catch (err) {
      setError(err.message || "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  const ready = lineup && !canSave({ teamA: lineup.teamA, teamB: lineup.teamB, sets });

  return (
    <div className="stack">
      <BackHeader onBack={back} title="Proposer un score" sub="Les 4 devront valider" />

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
      </section>

      {lineup ? (
        <>
          <section className="board">
            <p className="side-name">
              {names[lineup.teamA[0]]} + {names[lineup.teamA[1]]}
            </p>
            <p className="vs">contre</p>
            <p className="side-name">
              {names[lineup.teamB[0]]} + {names[lineup.teamB[1]]}
            </p>
            <button type="button" className="btn" onClick={() => setRot((value) => value + 1)}>
              Tourner les partenaires
            </button>
          </section>

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
                    <div className="stepper">
                      <button type="button" onClick={() => updateSet(index, "a", set.a - 1)}>
                        −
                      </button>
                      <input value={set.a} onChange={(event) => updateSet(index, "a", Number(event.target.value.replace(/[^\d]/g, "") || 0))} />
                      <button type="button" onClick={() => updateSet(index, "a", set.a + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                  <div className="set-line">
                    <span>
                      {names[lineup.teamB[0]]} + {names[lineup.teamB[1]]}
                    </span>
                    <div className="stepper">
                      <button type="button" onClick={() => updateSet(index, "b", set.b - 1)}>
                        −
                      </button>
                      <input value={set.b} onChange={(event) => updateSet(index, "b", Number(event.target.value.replace(/[^\d]/g, "") || 0))} />
                      <button type="button" onClick={() => updateSet(index, "b", set.b + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="presets">
              {PRESETS.map((preset) => (
                <button key={preset.join("-")} type="button" className="chip" onClick={() => applyPreset(preset)}>
                  {preset[0]}-{preset[1]}
                </button>
              ))}
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button type="button" className="btn btn-primary btn-block" disabled={!ready || busy} onClick={save}>
              {busy ? "Envoi…" : "Proposer aux 4"}
            </button>
          </section>
        </>
      ) : (
        <p className="note">Choisis quatre joueurs.</p>
      )}
    </div>
  );
}
