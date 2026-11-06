// Ligue continue, pas un tableau.
// Un match = 4 joueurs, 3 sets. Les partenaires tournent pour que chaque joueur
// croise les autres. Le niveau part de 1000 et bouge selon les jeux gagnés :
// un 6-1 pèse plus qu'un 7-6, une victoire attendue ne fait presque pas bouger.

export function emptyState() {
  return {
    demo: false,
    identity: null, // { id, name }
    leagues: [],
    players: [],
    matches: [],
    seasons: [],
    sessions: [],
  };
}

export function isStateShape(data) {
  return Boolean(
    data &&
      Array.isArray(data.leagues) &&
      Array.isArray(data.players) &&
      Array.isArray(data.matches)
  );
}

export function migrateState(raw) {
  if (!isStateShape(raw)) return emptyState();
  const base = {
    demo: Boolean(raw.demo),
    identity: raw.identity && raw.identity.id && raw.identity.name ? raw.identity : null,
    leagues: raw.leagues || [],
    players: (raw.players || []).map((player) => ({
      ...player,
      identityId: player.identityId || null,
    })),
    matches: raw.matches || [],
    seasons: Array.isArray(raw.seasons) ? raw.seasons.slice() : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions.slice() : [],
  };

  for (const league of base.leagues) {
    if (!activeSeason(base.seasons, league.id)) {
      base.seasons.push(makeSeason(league.id, seasonName(base.seasons, league.id), earliestMatch(base.matches, league.id)));
    }
  }

  base.matches = base.matches.map((match) => {
    if (match.seasonId) return match;
    const season = activeSeason(base.seasons, match.leagueId);
    return season ? { ...match, seasonId: season.id } : match;
  });

  return base;
}

function earliestMatch(matches, leagueId) {
  const dates = matches
    .filter((match) => match.leagueId === leagueId)
    .map((match) => match.playedAt || match.createdAt)
    .filter(Boolean)
    .sort();
  return dates[0] || new Date().toISOString();
}

export function seasonName(seasons, leagueId) {
  const count = seasons.filter((season) => season.leagueId === leagueId).length;
  return `Saison ${count + 1}`;
}

export function makeSeason(leagueId, name, startedAt = new Date().toISOString()) {
  return {
    id: `s-${Math.random().toString(36).slice(2, 8)}`,
    leagueId,
    name,
    startedAt,
    closedAt: null,
  };
}

export function activeSeason(seasons, leagueId) {
  return seasons.find((season) => season.leagueId === leagueId && !season.closedAt) || null;
}

export function closedSeasons(seasons, leagueId) {
  return seasons
    .filter((season) => season.leagueId === leagueId && season.closedAt)
    .sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""));
}

export function matchesForSeason(matches, seasonId) {
  if (!seasonId) return matches;
  return matches.filter((match) => match.seasonId === seasonId);
}

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function lineupKey(match) {
  const keys = partnershipKeys(match).slice().sort();
  return keys.join("#");
}

export function partnershipKeys(match) {
  if (!match?.teamA || !match?.teamB || match.teamA.length < 2 || match.teamB.length < 2) return [];
  return [pairKey(match.teamA[0], match.teamA[1]), pairKey(match.teamB[0], match.teamB[1])];
}

export function oppositionKeys(match) {
  if (!match?.teamA || !match?.teamB) return [];
  const keys = [];
  for (const a of match.teamA) {
    for (const b of match.teamB) keys.push(pairKey(a, b));
  }
  return keys;
}

export function isPlayed(match) {
  return match?.status === "played" && Array.isArray(match.sets) && match.sets.length === 3;
}

export function sideOf(match, playerId) {
  if (match.teamA?.includes(playerId)) return "A";
  if (match.teamB?.includes(playerId)) return "B";
  return null;
}

export function matchTotals(sets) {
  let setsA = 0;
  let setsB = 0;
  let gamesA = 0;
  let gamesB = 0;
  for (const set of sets || []) {
    const a = Number(set.a) || 0;
    const b = Number(set.b) || 0;
    if (a > b) setsA += 1;
    else if (b > a) setsB += 1;
    gamesA += a;
    gamesB += b;
  }
  let winner = null;
  if (setsA > setsB) winner = "A";
  else if (setsB > setsA) winner = "B";
  return { setsA, setsB, gamesA, gamesB, winner };
}

export function validateSets(sets) {
  if (!Array.isArray(sets) || sets.length !== 3) return "Un match, c'est 3 sets.";
  for (let i = 0; i < 3; i += 1) {
    const a = sets[i]?.a;
    const b = sets[i]?.b;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 15 || b > 15) {
      return `Set ${i + 1} : score invalide.`;
    }
    if (a === b) return `Set ${i + 1} : il faut un vainqueur.`;
  }
  return null;
}

export function canSave(match) {
  const ids = [...(match.teamA || []), ...(match.teamB || [])];
  if (ids.length !== 4 || new Set(ids).size !== 4) return "Choisis quatre joueurs différents.";
  return validateSets(match.sets);
}

function kFor(playedBefore) {
  if (playedBefore < 4) return 110;
  if (playedBefore < 10) return 72;
  return 46;
}

export function computeRatings(players, matches) {
  const rating = Object.fromEntries(players.map((p) => [p.id, 1000]));
  const count = Object.fromEntries(players.map((p) => [p.id, 0]));
  const lastDelta = Object.fromEntries(players.map((p) => [p.id, null]));
  const ordered = matches.filter(isPlayed).slice().sort((a, b) => {
    const byDate = (a.playedAt || "").localeCompare(b.playedAt || "");
    return byDate || a.id.localeCompare(b.id);
  });

  for (const match of ordered) {
    const four = [...match.teamA, ...match.teamB];
    if (new Set(four).size !== 4) continue;
    if (four.some((id) => rating[id] == null)) continue;
    const ra = (rating[match.teamA[0]] + rating[match.teamA[1]]) / 2;
    const rb = (rating[match.teamB[0]] + rating[match.teamB[1]]) / 2;
    const expectedA = 1 / (1 + 10 ** ((rb - ra) / 400));
    const { gamesA, gamesB } = matchTotals(match.sets);
    const totalGames = gamesA + gamesB;
    if (!totalGames) continue;
    const actualA = gamesA / totalGames;

    for (const id of match.teamA) {
      const delta = kFor(count[id]) * (actualA - expectedA);
      rating[id] += delta;
      lastDelta[id] = delta;
      count[id] += 1;
    }
    for (const id of match.teamB) {
      const delta = kFor(count[id]) * (1 - actualA - (1 - expectedA));
      rating[id] += delta;
      lastDelta[id] = delta;
      count[id] += 1;
    }
  }

  return { rating, lastDelta, count };
}

export function ratingHistory(playerId, matches) {
  const players = [{ id: playerId }];
  const related = matches
    .filter(isPlayed)
    .filter((match) => sideOf(match, playerId))
    .sort((a, b) => (a.playedAt || "").localeCompare(b.playedAt || "") || a.id.localeCompare(b.id));

  // Rebuild with every player that appears so partner ratings stay consistent.
  const ids = new Set([playerId]);
  for (const match of related) {
    for (const id of [...match.teamA, ...match.teamB]) ids.add(id);
  }
  const cast = [...ids].map((id) => ({ id }));
  const rating = Object.fromEntries(cast.map((p) => [p.id, 1000]));
  const count = Object.fromEntries(cast.map((p) => [p.id, 0]));
  const points = [{ matchId: null, playedAt: null, rating: 1000, delta: 0 }];

  const ordered = matches
    .filter(isPlayed)
    .filter((match) => [...match.teamA, ...match.teamB].some((id) => ids.has(id)))
    .sort((a, b) => (a.playedAt || "").localeCompare(b.playedAt || "") || a.id.localeCompare(b.id));

  for (const match of ordered) {
    const four = [...match.teamA, ...match.teamB];
    if (new Set(four).size !== 4) continue;
    if (four.some((id) => rating[id] == null)) continue;
    const ra = (rating[match.teamA[0]] + rating[match.teamA[1]]) / 2;
    const rb = (rating[match.teamB[0]] + rating[match.teamB[1]]) / 2;
    const expectedA = 1 / (1 + 10 ** ((rb - ra) / 400));
    const { gamesA, gamesB } = matchTotals(match.sets);
    const totalGames = gamesA + gamesB;
    if (!totalGames) continue;
    const actualA = gamesA / totalGames;
    const before = rating[playerId];

    for (const id of match.teamA) {
      rating[id] += kFor(count[id]) * (actualA - expectedA);
      count[id] += 1;
    }
    for (const id of match.teamB) {
      rating[id] += kFor(count[id]) * (1 - actualA - (1 - expectedA));
      count[id] += 1;
    }

    if (sideOf(match, playerId)) {
      points.push({
        matchId: match.id,
        playedAt: match.playedAt,
        rating: rating[playerId],
        delta: rating[playerId] - before,
      });
    }
  }

  return points;
}

export function playerRecord(playerId, matches) {
  const list = matches
    .filter((m) => isPlayed(m) && sideOf(m, playerId))
    .sort((a, b) => (a.playedAt || "").localeCompare(b.playedAt || "") || a.id.localeCompare(b.id));
  const record = {
    wins: 0,
    losses: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    form: [],
    played: list.length,
    matches: list,
  };
  for (const match of list) {
    const side = sideOf(match, playerId);
    const totals = matchTotals(match.sets);
    const won = totals.winner === side;
    if (won) record.wins += 1;
    else record.losses += 1;
    if (side === "A") {
      record.setsFor += totals.setsA;
      record.setsAgainst += totals.setsB;
      record.gamesFor += totals.gamesA;
      record.gamesAgainst += totals.gamesB;
    } else {
      record.setsFor += totals.setsB;
      record.setsAgainst += totals.setsA;
      record.gamesFor += totals.gamesB;
      record.gamesAgainst += totals.gamesA;
    }
    record.form.push(won ? "W" : "L");
  }
  return record;
}

function blankRow(partnerId) {
  return {
    partnerId,
    wins: 0,
    losses: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    setsFor: 0,
    setsAgainst: 0,
    matches: [],
  };
}

function addSide(row, match, side) {
  const totals = matchTotals(match.sets);
  const won = totals.winner === side;
  if (won) row.wins += 1;
  else row.losses += 1;
  if (side === "A") {
    row.gamesFor += totals.gamesA;
    row.gamesAgainst += totals.gamesB;
    row.setsFor += totals.setsA;
    row.setsAgainst += totals.setsB;
  } else {
    row.gamesFor += totals.gamesB;
    row.gamesAgainst += totals.gamesA;
    row.setsFor += totals.setsB;
    row.setsAgainst += totals.setsA;
  }
  row.matches.push(match);
}

export function partnerRows(playerId, matches) {
  const map = new Map();
  for (const match of matches.filter(isPlayed)) {
    const side = sideOf(match, playerId);
    if (!side) continue;
    const team = side === "A" ? match.teamA : match.teamB;
    const partnerId = team.find((id) => id !== playerId);
    if (!partnerId) continue;
    const row = map.get(partnerId) || blankRow(partnerId);
    addSide(row, match, side);
    map.set(partnerId, row);
  }
  return [...map.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || b.gamesFor - a.gamesFor);
}

export function opponentRows(playerId, matches) {
  const map = new Map();
  for (const match of matches.filter(isPlayed)) {
    const side = sideOf(match, playerId);
    if (!side) continue;
    const foes = side === "A" ? match.teamB : match.teamA;
    for (const foe of foes) {
      const row = map.get(foe) || blankRow(foe);
      addSide(row, match, side);
      map.set(foe, row);
    }
  }
  return [...map.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
}

export function duoRecord(a, b, matches, mode) {
  const row = blankRow(b);
  for (const match of matches.filter(isPlayed)) {
    const sideA = sideOf(match, a);
    const sideB = sideOf(match, b);
    if (!sideA || !sideB) continue;
    const together = sideA === sideB;
    if (mode === "with" && !together) continue;
    if (mode === "against" && together) continue;
    addSide(row, match, sideA);
  }
  return row;
}

export function timesTogether(matches, a, b) {
  const key = pairKey(a, b);
  return matches.filter(isPlayed).filter((m) => partnershipKeys(m).includes(key)).length;
}

export function pairCoverage(players, matches, mode) {
  const possible = new Set();
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      possible.add(pairKey(players[i].id, players[j].id));
    }
  }
  const seen = new Set();
  for (const match of matches.filter(isPlayed)) {
    const keys = mode === "against" ? oppositionKeys(match) : partnershipKeys(match);
    for (const key of keys) if (possible.has(key)) seen.add(key);
  }
  return { done: seen.size, total: possible.size };
}

export function missingPartnerships(players, matches) {
  const seen = new Set();
  for (const match of matches.filter(isPlayed)) {
    for (const key of partnershipKeys(match)) seen.add(key);
  }
  const missing = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      if (!seen.has(pairKey(players[i].id, players[j].id))) missing.push([players[i], players[j]]);
    }
  }
  missing.sort((a, b) => a[0].name.localeCompare(b[0].name, "fr") || a[1].name.localeCompare(b[1].name, "fr"));
  return missing;
}

function countKeys(matches, pick) {
  const map = new Map();
  for (const match of matches) {
    for (const key of pick(match)) map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function teamAvg(ids, rating) {
  return (rating[ids[0]] + rating[ids[1]]) / 2;
}

function splitScore(teamA, teamB, together, against, rating) {
  const draft = { teamA, teamB };
  let novelty = 0;
  for (const key of partnershipKeys(draft)) novelty += 100 / (1 + (together.get(key) || 0));
  for (const key of oppositionKeys(draft)) novelty += 18 / (1 + (against.get(key) || 0));
  const balance = Math.abs(teamAvg(teamA, rating) - teamAvg(teamB, rating));
  // Prefer novelty, then close team strengths.
  return novelty - balance * 0.35;
}

function bestSplit(group, together, against, rating) {
  const [a, b, c, d] = group.map((p) => p.id);
  const options = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
  let best = null;
  for (const option of options) {
    const score = splitScore(option.teamA, option.teamB, together, against, rating);
    if (!best || score > best.score) best = { ...option, score };
  }
  return best;
}

export function suggestRound(players, matches, ratingMap = null) {
  if (players.length < 4) return { fixtures: [], resting: players.slice() };
  const played = matches.filter(isPlayed);
  const together = countKeys(played, partnershipKeys);
  const against = countKeys(played, oppositionKeys);
  const pack = ratingMap || computeRatings(players, matches).rating;
  const rating = Object.fromEntries(players.map((p) => [p.id, pack[p.id] ?? 1000]));
  const playedCount = Object.fromEntries(players.map((p) => [p.id, 0]));
  const lastAt = Object.fromEntries(players.map((p) => [p.id, ""]));
  for (const match of played) {
    for (const id of [...match.teamA, ...match.teamB]) {
      if (playedCount[id] == null) continue;
      playedCount[id] += 1;
      if ((match.playedAt || "") > lastAt[id]) lastAt[id] = match.playedAt || "";
    }
  }

  const pool = players.slice().sort((a, b) => {
    const byCount = playedCount[a.id] - playedCount[b.id];
    if (byCount) return byCount;
    const byRecent = lastAt[a.id].localeCompare(lastAt[b.id]);
    if (byRecent) return byRecent;
    return a.name.localeCompare(b.name, "fr");
  });

  const used = new Set();
  const fixtures = [];
  const courts = Math.floor(pool.length / 4);
  for (let court = 0; court < courts; court += 1) {
    const available = pool.filter((p) => !used.has(p.id));
    const anchor = available[0];
    const rest = available.slice(1);
    let best = null;
    for (let i = 0; i < rest.length; i += 1) {
      for (let j = i + 1; j < rest.length; j += 1) {
        for (let k = j + 1; k < rest.length; k += 1) {
          const group = [anchor, rest[i], rest[j], rest[k]];
          const split = bestSplit(group, together, against, rating);
          const load = group.reduce((sum, p) => sum + playedCount[p.id], 0);
          const recent = group.reduce((sum, p) => sum + (lastAt[p.id] ? Date.parse(lastAt[p.id]) : 0), 0);
          const score = split.score - load * 0.01 - recent / 1e15;
          if (!best || score > best.total) best = { ...split, total: score, group };
        }
      }
    }
    for (const player of best.group) used.add(player.id);
    fixtures.push({ teamA: best.teamA, teamB: best.teamB });
  }

  return { fixtures, resting: pool.filter((p) => !used.has(p.id)) };
}

export function cycleLineup(teamA, teamB, direction = 1) {
  const [a, b, c, d] = [...teamA, ...teamB].slice().sort();
  const options = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
  const key = lineupKey({ teamA, teamB });
  let index = options.findIndex((option) => lineupKey(option) === key);
  if (index < 0) index = 0;
  const next = (index + direction + options.length) % options.length;
  return options[next];
}

export function rotateFrom(teamA, teamB, steps) {
  let current = { teamA, teamB };
  const n = ((steps % 3) + 3) % 3;
  for (let i = 0; i < n; i += 1) current = cycleLineup(current.teamA, current.teamB, 1);
  return current;
}

export function fullRotation(players, matches) {
  if (players.length !== 4) return null;
  const [a, b, c, d] = players.slice().sort((p, q) => p.id.localeCompare(q.id));
  const partitions = [
    { teamA: [a.id, b.id], teamB: [c.id, d.id] },
    { teamA: [a.id, c.id], teamB: [b.id, d.id] },
    { teamA: [a.id, d.id], teamB: [b.id, c.id] },
  ];
  return partitions.map((part) => {
    const key = lineupKey(part);
    const count = matches.filter((m) => (m.status === "played" || m.status === "planned") && lineupKey(m) === key).length;
    return { ...part, count };
  });
}

function gameRate(row) {
  const total = row.gamesFor + row.gamesAgainst;
  if (!total) return 0;
  return row.gamesFor / total;
}

function resultPhrase(row) {
  const games = `${row.gamesFor} jeux à ${row.gamesAgainst}`;
  const wins = row.wins === 1 ? "une victoire" : `${row.wins} victoires`;
  const losses = row.losses === 1 ? "une défaite" : `${row.losses} défaites`;
  if (row.wins && row.losses) return `${games}, ${wins} et ${losses}`;
  if (row.wins) return `${games}, ${wins}`;
  return `${games}, ${losses}`;
}

export function rotationReadings(players, matches) {
  const name = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const contrasts = [];
  const steadys = [];
  for (const player of players) {
    const rows = partnerRows(player.id, matches).filter((row) => row.gamesFor + row.gamesAgainst >= 6);
    if (rows.length < 2) continue;
    const ranked = rows.slice().sort((a, b) => gameRate(b) - gameRate(a));
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const gap = gameRate(best) - gameRate(worst);
    if (gap >= 0.28 && best.partnerId !== worst.partnerId) {
      contrasts.push({
        playerId: player.id,
        gap,
        text: `${name[player.id]} avec ${name[best.partnerId]} : ${resultPhrase(best)}. Avec ${name[worst.partnerId]} : ${resultPhrase(worst)}.`,
      });
      continue;
    }
    if (rows.length >= 3) {
      const rates = rows.map(gameRate);
      const spread = Math.max(...rates) - Math.min(...rates);
      if (spread <= 0.16) {
        steadys.push({
          playerId: player.id,
          text: `${name[player.id]} garde le même rendement avec ${rows.length} partenaires. Le niveau est le sien, pas celui d'une seule paire.`,
        });
      }
    }
  }
  contrasts.sort((a, b) => b.gap - a.gap);
  return { contrasts, steadys };
}

export function leagueAdvice(league, leagues, players, matches, rating) {
  const members = players.filter((p) => p.leagueId === league.id);
  const rated = members.filter((p) => playerRecord(p.id, matches).played >= 4);
  if (rated.length < 4) return [];
  const avg = rated.reduce((sum, p) => sum + rating[p.id], 0) / rated.length;
  const up = leagues.find((item) => item.tier === league.tier - 1);
  const down = leagues.find((item) => item.tier === league.tier + 1);
  const tips = [];
  for (const player of rated) {
    const level = rating[player.id];
    if (level >= avg + 85) {
      tips.push({
        playerId: player.id,
        direction: "up",
        targetId: up?.id || null,
        text: up
          ? `${player.name} est au-dessus de ${league.name}. À faire monter en ${up.name}.`
          : `${player.name} dépasse ${league.name}. Il n'y a pas encore de ligue au-dessus.`,
      });
    } else if (level <= avg - 85) {
      tips.push({
        playerId: player.id,
        direction: "down",
        targetId: down?.id || null,
        text: down
          ? `${player.name} est en dessous de ${league.name}. À faire descendre en ${down.name}.`
          : `${player.name} est en dessous de ${league.name}. Il n'y a pas encore de ligue en dessous.`,
      });
    }
  }
  return tips;
}

export function reliability(played) {
  if (!played) return { key: "none", label: "sans match" };
  if (played < 4) return { key: "low", label: "échantillon court" };
  if (played < 8) return { key: "mid", label: "niveau en cours" };
  return { key: "high", label: "niveau lisible" };
}

export function seasonStanding(players, matches, rating) {
  return players
    .slice()
    .map((player) => {
      const record = playerRecord(player.id, matches);
      return {
        id: player.id,
        name: player.name,
        rating: rating[player.id] ?? 1000,
        wins: record.wins,
        losses: record.losses,
        played: record.played,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name, "fr"));
}

function match(id, leagueId, seasonId, playedAt, a1, a2, b1, b2, sets) {
  return {
    id,
    leagueId,
    seasonId,
    status: "played",
    playedAt,
    createdAt: playedAt,
    teamA: [a1, a2],
    teamB: [b1, b2],
    sets: sets.map(([a, b]) => ({ a, b })),
  };
}

export function createDemoState() {
  const leagues = [
    { id: "l1", name: "Ligue 1", tier: 1 },
    { id: "l2", name: "Ligue 2", tier: 2 },
  ];
  const seasons = [
    { id: "s1", leagueId: "l1", name: "Saison 1", startedAt: "2026-10-01T08:00:00.000Z", closedAt: null },
    { id: "s2", leagueId: "l2", name: "Saison 1", startedAt: "2026-10-01T08:00:00.000Z", closedAt: null },
  ];
  const players = [
    ["hugo", "Hugo", "l1"],
    ["camille", "Camille", "l1"],
    ["ines", "Inès", "l1"],
    ["lucas", "Lucas", "l1"],
    ["chloe", "Chloé", "l1"],
    ["adam", "Adam", "l1"],
    ["nina", "Nina", "l1"],
    ["malik", "Malik", "l1"],
    ["lea", "Léa", "l2"],
    ["noah", "Noah", "l2"],
    ["manon", "Manon", "l2"],
    ["tom", "Tom", "l2"],
    ["sarah", "Sarah", "l2"],
    ["jules", "Jules", "l2"],
  ].map(([id, name, leagueId]) => ({ id, name, leagueId }));

  const matches = [
    match("m01", "l1", "s1", "2026-10-06T17:00:00.000Z", "hugo", "camille", "ines", "lucas", [[6, 1], [6, 2], [6, 1]]),
    match("m02", "l1", "s1", "2026-10-08T17:00:00.000Z", "hugo", "ines", "lucas", "camille", [[1, 6], [2, 6], [3, 6]]),
    match("m03", "l1", "s1", "2026-10-11T17:00:00.000Z", "hugo", "lucas", "camille", "ines", [[6, 4], [4, 6], [7, 5]]),
    match("m04", "l1", "s1", "2026-10-13T17:00:00.000Z", "chloe", "adam", "nina", "malik", [[6, 3], [6, 4], [6, 2]]),
    match("m05", "l1", "s1", "2026-10-15T17:00:00.000Z", "chloe", "nina", "adam", "malik", [[4, 6], [6, 3], [6, 4]]),
    match("m06", "l1", "s1", "2026-10-18T17:00:00.000Z", "chloe", "malik", "adam", "nina", [[6, 4], [3, 6], [4, 6]]),
    match("m07", "l1", "s1", "2026-10-20T17:00:00.000Z", "hugo", "chloe", "ines", "adam", [[6, 2], [6, 3], [6, 4]]),
    match("m08", "l1", "s1", "2026-10-22T17:00:00.000Z", "camille", "nina", "lucas", "malik", [[6, 3], [6, 4], [7, 5]]),
    match("m09", "l1", "s1", "2026-10-25T17:00:00.000Z", "hugo", "adam", "camille", "malik", [[3, 6], [4, 6], [2, 6]]),
    match("m10", "l1", "s1", "2026-10-27T17:00:00.000Z", "ines", "nina", "chloe", "lucas", [[6, 4], [2, 6], [1, 6]]),
    match("m11", "l1", "s1", "2026-10-29T17:00:00.000Z", "camille", "chloe", "hugo", "nina", [[7, 5], [6, 4], [3, 6]]),
    match("m12", "l1", "s1", "2026-11-01T17:00:00.000Z", "lucas", "adam", "malik", "nina", [[6, 4], [6, 3], [6, 4]]),
    match("m13", "l1", "s1", "2026-11-03T17:00:00.000Z", "hugo", "malik", "ines", "chloe", [[6, 4], [6, 2], [7, 6]]),
    match("m14", "l1", "s1", "2026-11-03T19:30:00.000Z", "camille", "adam", "lucas", "nina", [[6, 2], [6, 4], [6, 3]]),
    match("m15", "l2", "s2", "2026-10-09T17:00:00.000Z", "lea", "noah", "manon", "tom", [[6, 4], [6, 4], [4, 6]]),
    match("m16", "l2", "s2", "2026-10-16T17:00:00.000Z", "lea", "manon", "noah", "sarah", [[2, 6], [6, 3], [1, 6]]),
    match("m17", "l2", "s2", "2026-10-23T17:00:00.000Z", "tom", "sarah", "jules", "lea", [[6, 3], [6, 2], [6, 4]]),
    match("m18", "l2", "s2", "2026-10-30T17:00:00.000Z", "noah", "jules", "manon", "sarah", [[7, 5], [4, 6], [6, 4]]),
    match("m19", "l2", "s2", "2026-11-02T17:00:00.000Z", "tom", "jules", "lea", "sarah", [[3, 6], [4, 6], [6, 7]]),
  ];

  return {
    demo: true,
    identity: { id: "me-hugo", name: "Hugo" },
    leagues,
    players: players.map((player) =>
      player.id === "hugo" ? { ...player, identityId: "me-hugo" } : { ...player, identityId: null }
    ),
    matches,
    seasons,
    sessions: [],
  };
}
