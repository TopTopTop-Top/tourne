import { matchTotals } from "./logic";

const AVATAR_COLORS = ["#dff56a", "#ff8a5b", "#8ee0c2", "#9ec0ff", "#f2c14e", "#ffb3cf", "#d7c4a3", "#c8f58a"];

export function formatScore(sets) {
  if (!sets?.length) return "à jouer";
  return sets.map((set) => `${set.a}-${set.b}`).join(" · ");
}

export function formatDelta(value) {
  if (value == null || Number.isNaN(value)) return "";
  const rounded = Math.round(value);
  if (!rounded) return "0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function initials(name) {
  const clean = (name || "?").trim();
  return clean.slice(0, 1).toLocaleUpperCase("fr");
}

export function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function formatDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function colorFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function heatStyle(gamesFor, gamesAgainst, played) {
  if (!played) return { background: "transparent", color: "var(--faint)" };
  const rate = gamesFor / Math.max(1, gamesFor + gamesAgainst);
  const clay = [255, 138, 91];
  const mid = [47, 62, 52];
  const ball = [223, 245, 106];
  const mix = (from, to, t) => from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
  const rgb = rate < 0.5 ? mix(clay, mid, rate / 0.5) : mix(mid, ball, (rate - 0.5) / 0.5);
  return {
    background: `rgb(${rgb.join(",")})`,
    color: rate > 0.78 ? "#17210c" : "#f4f7f1",
  };
}

export function namesOf(players, ids) {
  const byId = Object.fromEntries(players.map((player) => [player.id, player.name]));
  return ids.map((id) => byId[id] || "Joueur");
}

export function dayShareText({ leagueName, date, names, fixtures, matches, resting }) {
  const lines = [`Tourne — ${leagueName}`, formatDay(date) || "Journée", ""];
  const list = matches?.length
    ? matches
    : (fixtures || []).map((fixture, index) => ({
        ...fixture,
        status: "planned",
        id: `f${index}`,
      }));

  list.forEach((match, index) => {
    const a = `${names[match.teamA[0]]} + ${names[match.teamA[1]]}`;
    const b = `${names[match.teamB[0]]} + ${names[match.teamB[1]]}`;
    if (match.status === "played" && match.sets?.length) {
      const totals = matchTotals(match.sets);
      lines.push(`Terrain ${index + 1}`);
      lines.push(`${a}  ${totals.setsA}-${totals.setsB}  ${b}`);
      lines.push(formatScore(match.sets));
    } else {
      lines.push(`Terrain ${index + 1}`);
      lines.push(`${a}`);
      lines.push(`contre`);
      lines.push(`${b}`);
    }
    lines.push("");
  });

  if (resting?.length) {
    lines.push(`Repos : ${resting.map((player) => player.name || names[player.id] || player).join(", ")}`);
  }

  return lines.join("\n").trim();
}

export function standingShareText({ leagueName, seasonName, rows }) {
  const lines = [`Tourne — ${leagueName}`, seasonName || "Saison", ""];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.name}  ${Math.round(row.rating)}  (${row.wins}V-${row.losses}D)`);
  });
  return lines.join("\n");
}

export async function shareOrCopy(text, title = "Tourne") {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return { ok: true, mode: "share" };
    } catch (error) {
      if (error?.name === "AbortError") return { ok: false, mode: "abort" };
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, mode: "copy" };
  } catch {
    return { ok: false, mode: "fail" };
  }
}
