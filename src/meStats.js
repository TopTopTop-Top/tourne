import {
  computeRatings,
  isPlayed,
  matchTotals,
  opponentRows,
  partnerRows,
  playerRecord,
  sideOf,
} from "./logic";

/** Agrège les stats d'une identité à travers plusieurs ligues / fiches joueur. */
export function buildMeStats({ identityId, identityName, players, matches, leagues }) {
  const mine = players.filter(
    (player) =>
      player.identityId === identityId ||
      player.userId === identityId ||
      (identityName && player.name.toLocaleLowerCase("fr") === identityName.toLocaleLowerCase("fr"))
  );
  const myIds = new Set(mine.map((player) => player.id));
  const relevant = matches.filter(
    (match) => isPlayed(match) && [...match.teamA, ...match.teamB].some((id) => myIds.has(id))
  );

  const wins = { wins: 0, losses: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0, form: [], played: 0, matches: [] };
  const byLeague = new Map();
  const partnerMap = new Map();
  const foeMap = new Map();
  const nameById = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const leagueById = Object.fromEntries((leagues || []).map((league) => [league.id, league]));

  for (const match of relevant.slice().sort((a, b) => (a.playedAt || "").localeCompare(b.playedAt || ""))) {
    const mySide = match.teamA.some((id) => myIds.has(id)) ? "A" : "B";
    const totals = matchTotals(match.sets);
    const won = totals.winner === mySide;
    wins.played += 1;
    if (won) wins.wins += 1;
    else wins.losses += 1;
    if (mySide === "A") {
      wins.setsFor += totals.setsA;
      wins.setsAgainst += totals.setsB;
      wins.gamesFor += totals.gamesA;
      wins.gamesAgainst += totals.gamesB;
    } else {
      wins.setsFor += totals.setsB;
      wins.setsAgainst += totals.setsA;
      wins.gamesFor += totals.gamesB;
      wins.gamesAgainst += totals.gamesA;
    }
    wins.form.push(won ? "W" : "L");
    wins.matches.push({ ...match, won, mySide });

    const leagueId = match.leagueId;
    const bucket = byLeague.get(leagueId) || { leagueId, wins: 0, losses: 0, played: 0 };
    bucket.played += 1;
    if (won) bucket.wins += 1;
    else bucket.losses += 1;
    byLeague.set(leagueId, bucket);

    const team = mySide === "A" ? match.teamA : match.teamB;
    const foes = mySide === "A" ? match.teamB : match.teamA;
    const partnerId = team.find((id) => !myIds.has(id));
    if (partnerId) {
      const row = partnerMap.get(partnerId) || blank(partnerId);
      add(row, match, mySide);
      partnerMap.set(partnerId, row);
    }
    for (const foe of foes) {
      const row = foeMap.get(foe) || blank(foe);
      add(row, match, mySide);
      foeMap.set(foe, row);
    }
  }

  // Niveau : on recalcule sur l'ensemble, puis on moyenne les fiches liées
  const pack = computeRatings(players, matches.filter(isPlayed));
  const levels = mine.map((player) => pack.rating[player.id]).filter((value) => value != null);
  const rating = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1000;

  const partners = [...partnerMap.values()]
    .map((row) => ({ ...row, name: nameById[row.partnerId] || "Joueur" }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || b.gamesFor - a.gamesFor);

  const opponents = [...foeMap.values()]
    .map((row) => ({ ...row, name: nameById[row.partnerId] || "Joueur" }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || b.gamesFor - a.gamesFor);

  const leagueRows = [...byLeague.values()].map((row) => ({
    ...row,
    name: leagueById[row.leagueId]?.name || "Ligue",
  }));

  return {
    mine,
    myIds,
    record: wins,
    rating,
    partners,
    opponents,
    leagueRows,
    nameById,
  };
}

function blank(partnerId) {
  return {
    partnerId,
    wins: 0,
    losses: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    setsFor: 0,
    setsAgainst: 0,
  };
}

function add(row, match, side) {
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
}

export function headToHeadText(row) {
  return `${row.wins}V-${row.losses}D · jeux ${row.gamesFor}-${row.gamesAgainst}`;
}

/** Pour une fiche locale seule. */
export function singlePlayerVersus(playerId, players, matches) {
  return {
    partners: partnerRows(playerId, matches).map((row) => ({
      ...row,
      name: players.find((player) => player.id === row.partnerId)?.name || "Joueur",
    })),
    opponents: opponentRows(playerId, matches).map((row) => ({
      ...row,
      name: players.find((player) => player.id === row.partnerId)?.name || "Joueur",
    })),
    record: playerRecord(playerId, matches),
  };
}

export function filterMatchesForIdentity(matches, myIds) {
  return matches.filter((match) => isPlayed(match) && [...(match.teamA || []), ...(match.teamB || [])].some((id) => myIds.has(id)));
}

export { sideOf };
