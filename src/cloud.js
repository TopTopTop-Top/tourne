import { supabase } from "./supabase";

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() || email.split("@")[0] } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle();
  if (error) throw error;
  return data || { id: userData.user.id, display_name: userData.user.email };
}

export async function listMyLeagues() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, tier, invite_code, owner_id, created_at, merged_into, league_members!inner(user_id, role)")
    .eq("league_members.user_id", userData.user.id)
    .is("merged_into", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((league) => ({
    ...league,
    myRole: league.league_members?.[0]?.role || "member",
  }));
}

export async function createLeague(name, tier = 1) {
  const { data, error } = await supabase.rpc("create_league", {
    p_name: name,
    p_tier: Number(tier) || 1,
  });
  if (error) throw error;
  return data;
}

export async function joinLeague(code) {
  const { data, error } = await supabase.rpc("join_league", { p_code: code });
  if (error) throw error;
  return data;
}

export async function loadLeagueBundle(leagueId) {
  const [league, members, players, seasons, matches, sessions] = await Promise.all([
    supabase.from("leagues").select("*").eq("id", leagueId).single(),
    supabase.from("league_members").select("user_id, role, profiles(display_name)").eq("league_id", leagueId),
    supabase.from("players").select("*").eq("league_id", leagueId).order("name"),
    supabase.from("seasons").select("*").eq("league_id", leagueId).order("started_at"),
    supabase.from("matches").select("*").eq("league_id", leagueId).order("created_at"),
    supabase.from("sessions").select("*").eq("league_id", leagueId).order("date", { ascending: false }),
  ]);

  for (const result of [league, members, players, seasons, matches, sessions]) {
    if (result.error) throw result.error;
  }

  return {
    league: league.data,
    members: members.data || [],
    players: players.data || [],
    seasons: seasons.data || [],
    matches: (matches.data || []).map(mapMatch),
    sessions: sessions.data || [],
  };
}

function mapMatch(row) {
  return {
    id: row.id,
    leagueId: row.league_id,
    seasonId: row.season_id,
    sessionId: row.session_id,
    teamA: row.team_a,
    teamB: row.team_b,
    sets: row.sets || [],
    status: row.status === "confirmed" ? "played" : row.status,
    cloudStatus: row.status,
    proposedBy: row.proposed_by,
    playedAt: row.played_at,
    createdAt: row.created_at,
  };
}

export async function addPlayer(leagueId, name) {
  const { data, error } = await supabase
    .from("players")
    .insert({ league_id: leagueId, name: name.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function claimPlayer(playerId) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await supabase
    .from("players")
    .update({ user_id: userData.user.id })
    .eq("id", playerId)
    .is("user_id", null)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function proposeMatch({
  leagueId,
  seasonId,
  sessionId,
  teamA,
  teamB,
  sets,
  playedAt,
  matchId,
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const payload = {
    league_id: leagueId,
    season_id: seasonId,
    session_id: sessionId || null,
    team_a: teamA,
    team_b: teamB,
    sets,
    status: "proposed",
    proposed_by: userData.user.id,
    played_at: playedAt || new Date().toISOString(),
  };

  let result;
  if (matchId) {
    result = await supabase.from("matches").update(payload).eq("id", matchId).select("*").single();
  } else {
    result = await supabase.from("matches").insert(payload).select("*").single();
  }
  if (result.error) throw result.error;

  // Auto-vote du proposeur s'il est un des 4 liés
  try {
    await supabase.rpc("vote_match", { p_match_id: result.data.id, p_vote: "approve" });
  } catch {
    // Pas forcément un des 4 liés
  }

  const refreshed = await supabase.rpc("refresh_match_status", { p_match_id: result.data.id });
  if (!refreshed.error && refreshed.data) return mapMatch(refreshed.data);
  return mapMatch(result.data);
}

export async function voteMatch(matchId, vote) {
  const { data, error } = await supabase.rpc("vote_match", {
    p_match_id: matchId,
    p_vote: vote,
  });
  if (error) throw error;
  return mapMatch(data);
}

export async function listValidations(matchId) {
  const { data, error } = await supabase
    .from("match_validations")
    .select("user_id, vote, created_at, profiles(display_name)")
    .eq("match_id", matchId);
  if (error) throw error;
  return data || [];
}

export async function probeSchema() {
  const { error } = await supabase.from("leagues").select("id").limit(1);
  if (error?.code === "PGRST205") return { ok: false, missing: true };
  if (error) return { ok: false, missing: false, error };
  return { ok: true };
}

/** Toutes mes fiches liées + matchs confirmés pour stats globales. */
export async function loadMyUniverse() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user.id;

  const [playersRes, leaguesRes] = await Promise.all([
    supabase.from("players").select("*").eq("user_id", userId),
    supabase
      .from("leagues")
      .select("id, name, tier, invite_code, league_members!inner(user_id)")
      .eq("league_members.user_id", userId)
      .is("merged_into", null),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (leaguesRes.error) throw leaguesRes.error;

  const myPlayers = playersRes.data || [];
  const leagues = leaguesRes.data || [];
  const leagueIds = leagues.map((league) => league.id);

  if (!leagueIds.length) {
    return { userId, players: [], leagues: [], matches: [], allPlayers: [] };
  }

  const [matchesRes, allPlayersRes] = await Promise.all([
    supabase.from("matches").select("*").in("league_id", leagueIds).eq("status", "confirmed"),
    supabase.from("players").select("*").in("league_id", leagueIds),
  ]);
  if (matchesRes.error) throw matchesRes.error;
  if (allPlayersRes.error) throw allPlayersRes.error;

  return {
    userId,
    players: myPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      leagueId: player.league_id,
      userId: player.user_id,
      identityId: player.user_id,
    })),
    allPlayers: (allPlayersRes.data || []).map((player) => ({
      id: player.id,
      name: player.name,
      leagueId: player.league_id,
      userId: player.user_id,
      identityId: player.user_id,
    })),
    leagues: leagues.map((league) => ({ id: league.id, name: league.name, tier: league.tier })),
    matches: (matchesRes.data || []).map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      seasonId: row.season_id,
      teamA: row.team_a,
      teamB: row.team_b,
      sets: row.sets || [],
      status: "played",
      playedAt: row.played_at,
      createdAt: row.created_at,
    })),
  };
}
