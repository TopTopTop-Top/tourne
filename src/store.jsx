import { createContext, useContext, useEffect, useReducer } from "react";
import {
  activeSeason,
  createDemoState,
  emptyState,
  isStateShape,
  makeSeason,
  migrateState,
  seasonName,
} from "./logic";

const STORAGE_KEY = "tourne-v2";
const LEGACY_KEY = "tourne-v1";
const StoreContext = createContext(null);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isStateShape(parsed)) return migrateState({ demo: false, ...parsed });
    }
  } catch {
    // Un fichier local illisible ne doit pas bloquer l'app.
  }
  return createDemoState();
}

function cleanName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function ensureSeason(state, leagueId) {
  if (activeSeason(state.seasons || [], leagueId)) return state;
  const season = makeSeason(leagueId, seasonName(state.seasons || [], leagueId));
  return { ...state, seasons: [...(state.seasons || []), season] };
}

function withActiveSeasonId(state, leagueId) {
  const next = ensureSeason(state, leagueId);
  return activeSeason(next.seasons, leagueId)?.id || null;
}

function reducer(state, action) {
  switch (action.type) {
    case "add-league": {
      const season = makeSeason(action.league.id, "Saison 1");
      return {
        ...state,
        leagues: [...state.leagues, action.league],
        seasons: [...(state.seasons || []), season],
      };
    }
    case "update-league":
      return {
        ...state,
        leagues: state.leagues.map((league) =>
          league.id === action.id ? { ...league, name: action.name, tier: action.tier } : league
        ),
      };
    case "delete-league":
      if (state.players.some((player) => player.leagueId === action.id)) return state;
      return {
        ...state,
        leagues: state.leagues.filter((league) => league.id !== action.id),
        seasons: (state.seasons || []).filter((season) => season.leagueId !== action.id),
        sessions: (state.sessions || []).filter((session) => session.leagueId !== action.id),
        matches: state.matches.filter((match) => match.leagueId !== action.id),
      };
    case "set-identity":
      return { ...state, identity: action.identity };
    case "claim-player":
      return {
        ...state,
        players: state.players.map((player) => {
          if (player.id === action.playerId) return { ...player, identityId: action.identityId };
          if (action.identityId && player.identityId === action.identityId && player.leagueId === action.leagueId) {
            return { ...player, identityId: null };
          }
          return player;
        }),
      };
    case "add-player":
      return { ...state, players: [...state.players, action.player] };
    case "rename-player":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.id ? { ...player, name: action.name } : player
        ),
      };
    case "move-player":
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === action.id ? { ...player, leagueId: action.leagueId } : player
        ),
      };
    case "delete-player":
      if (state.matches.some((match) => match.teamA.includes(action.id) || match.teamB.includes(action.id))) {
        return state;
      }
      return {
        ...state,
        players: state.players.filter((player) => player.id !== action.id),
        sessions: (state.sessions || []).map((session) => ({
          ...session,
          presentPlayerIds: session.presentPlayerIds.filter((id) => id !== action.id),
        })),
      };
    case "save-match": {
      let next = ensureSeason(state, action.match.leagueId);
      const seasonId = action.match.seasonId || activeSeason(next.seasons, action.match.leagueId)?.id;
      const match = { ...action.match, seasonId };
      const index = next.matches.findIndex((item) => item.id === match.id);
      const matches = next.matches.slice();
      if (index === -1) matches.push(match);
      else matches[index] = match;
      next = { ...next, matches };

      if (match.sessionId) {
        next = {
          ...next,
          sessions: (next.sessions || []).map((session) => {
            if (session.id !== match.sessionId) return session;
            const ids = session.matchIds.includes(match.id) ? session.matchIds : [...session.matchIds, match.id];
            return { ...session, matchIds: ids };
          }),
        };
      }
      return next;
    }
    case "delete-match":
      return {
        ...state,
        matches: state.matches.filter((match) => match.id !== action.id),
        sessions: (state.sessions || []).map((session) => ({
          ...session,
          matchIds: session.matchIds.filter((id) => id !== action.id),
        })),
      };
    case "undo-last-match": {
      const played = state.matches
        .filter((match) => match.leagueId === action.leagueId && match.status === "played")
        .sort((a, b) => (b.playedAt || "").localeCompare(a.playedAt || "") || b.id.localeCompare(a.id));
      const last = played[0];
      if (!last) return state;
      return {
        ...state,
        matches: state.matches.filter((match) => match.id !== last.id),
        sessions: (state.sessions || []).map((session) => ({
          ...session,
          matchIds: session.matchIds.filter((id) => id !== last.id),
        })),
      };
    }
    case "plan-round": {
      let next = ensureSeason(state, action.leagueId);
      const seasonId = action.seasonId || activeSeason(next.seasons, action.leagueId)?.id;
      const createdAt = action.createdAt;
      const newMatches = action.fixtures.map((fixture) => ({
        id: fixture.id,
        leagueId: action.leagueId,
        seasonId,
        sessionId: action.sessionId || null,
        status: "planned",
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        sets: [],
        createdAt,
        playedAt: null,
      }));
      next = { ...next, matches: [...next.matches, ...newMatches] };
      if (action.sessionId) {
        next = {
          ...next,
          sessions: (next.sessions || []).map((session) =>
            session.id === action.sessionId
              ? { ...session, matchIds: [...session.matchIds, ...newMatches.map((match) => match.id)] }
              : session
          ),
        };
      }
      return next;
    }
    case "cancel-planned":
      return {
        ...state,
        matches: state.matches.filter((match) => {
          if (match.status !== "planned") return true;
          if (action.sessionId) return match.sessionId !== action.sessionId;
          return !(match.leagueId === action.leagueId && !match.sessionId);
        }),
        sessions: (state.sessions || []).map((session) => {
          if (action.sessionId && session.id !== action.sessionId) return session;
          if (!action.sessionId && session.leagueId !== action.leagueId) return session;
          const plannedIds = new Set(
            state.matches.filter((match) => match.status === "planned" && match.sessionId === session.id).map((m) => m.id)
          );
          return { ...session, matchIds: session.matchIds.filter((id) => !plannedIds.has(id)) };
        }),
      };
    case "upsert-session": {
      const sessions = state.sessions || [];
      const index = sessions.findIndex((session) => session.id === action.session.id);
      if (index === -1) return { ...state, sessions: [...sessions, action.session] };
      const next = sessions.slice();
      next[index] = action.session;
      return { ...state, sessions: next };
    }
    case "close-season": {
      const now = action.closedAt;
      const closed = (state.seasons || []).map((season) =>
        season.id === action.seasonId ? { ...season, closedAt: now, standing: action.standing } : season
      );
      const fresh = makeSeason(action.leagueId, seasonName(closed, action.leagueId), now);
      return { ...state, seasons: [...closed, fresh] };
    }
    case "replace":
      return migrateState(action.state);
    case "reset-demo":
      return createDemoState();
    case "reset-empty":
      return emptyState();
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Store manquant");
  const { state, dispatch } = ctx;

  return {
    state,
    addLeague(name, tier) {
      const clean = cleanName(name);
      if (!clean) return { error: "Donne un nom à la ligue." };
      const level = Math.max(1, Math.min(20, Number(tier) || 1));
      const league = { id: uid(), name: clean.slice(0, 32), tier: level };
      dispatch({ type: "add-league", league });
      return { league };
    },
    updateLeague(id, name, tier) {
      const clean = cleanName(name);
      if (!clean) return { error: "Donne un nom à la ligue." };
      dispatch({
        type: "update-league",
        id,
        name: clean.slice(0, 32),
        tier: Math.max(1, Math.min(20, Number(tier) || 1)),
      });
      return {};
    },
    deleteLeague(id) {
      if (state.players.some((player) => player.leagueId === id)) {
        return { error: "Retire d'abord les joueurs de la ligue." };
      }
      dispatch({ type: "delete-league", id });
      return {};
    },
    addPlayer(leagueId, name, asMe = false) {
      const clean = cleanName(name);
      if (!clean) return { error: "Écris un prénom." };
      if (clean.length > 24) return { error: "24 lettres maximum." };
      const exists = state.players.some(
        (player) => player.leagueId === leagueId && player.name.toLocaleLowerCase("fr") === clean.toLocaleLowerCase("fr")
      );
      if (exists) return { error: "Déjà dans la ligue." };
      const player = {
        id: uid(),
        name: clean,
        leagueId,
        identityId: asMe && state.identity?.id ? state.identity.id : null,
      };
      dispatch({ type: "add-player", player });
      if (player.identityId) {
        dispatch({
          type: "claim-player",
          playerId: player.id,
          identityId: player.identityId,
          leagueId,
        });
      }
      return { player };
    },

    renamePlayer(id, name) {
      const clean = cleanName(name);
      if (!clean) return { error: "Le nom est vide." };
      const current = state.players.find((player) => player.id === id);
      if (!current) return { error: "Joueur introuvable." };
      const exists = state.players.some(
        (player) =>
          player.id !== id &&
          player.leagueId === current.leagueId &&
          player.name.toLocaleLowerCase("fr") === clean.toLocaleLowerCase("fr")
      );
      if (exists) return { error: "Déjà dans la ligue." };
      dispatch({ type: "rename-player", id, name: clean.slice(0, 24) });
      return {};
    },
    movePlayer(id, leagueId) {
      if (!state.leagues.some((league) => league.id === leagueId)) return { error: "Ligue introuvable." };
      dispatch({ type: "move-player", id, leagueId });
      return {};
    },
    deletePlayer(id) {
      const used = state.matches.some((match) => match.teamA.includes(id) || match.teamB.includes(id));
      if (used) return { error: "Ce joueur a déjà des matchs. On garde la fiche pour l'historique." };
      dispatch({ type: "delete-player", id });
      return {};
    },
    saveMatch(match) {
      const seasonId = match.seasonId || withActiveSeasonId(state, match.leagueId);
      dispatch({ type: "save-match", match: { ...match, seasonId } });
    },
    deleteMatch(id) {
      dispatch({ type: "delete-match", id });
    },
    undoLastMatch(leagueId) {
      dispatch({ type: "undo-last-match", leagueId });
    },
    planRound(leagueId, fixtures, opts = {}) {
      dispatch({
        type: "plan-round",
        leagueId,
        fixtures,
        sessionId: opts.sessionId || null,
        seasonId: opts.seasonId || withActiveSeasonId(state, leagueId),
        createdAt: new Date().toISOString(),
      });
    },
    cancelPlanned(leagueId, sessionId = null) {
      dispatch({ type: "cancel-planned", leagueId, sessionId });
    },
    saveSession(session) {
      dispatch({ type: "upsert-session", session });
    },
    closeSeason(leagueId, seasonId, standing) {
      dispatch({ type: "close-season", leagueId, seasonId, standing, closedAt: new Date().toISOString() });
    },
    replaceState(next) {
      if (!isStateShape(next)) return { error: "Ce fichier ne contient pas une ligue Tourne." };
      dispatch({
        type: "replace",
        state: {
          demo: false,
          identity: next.identity || null,
          leagues: next.leagues,
          players: next.players,
          matches: next.matches,
          seasons: next.seasons || [],
          sessions: next.sessions || [],
        },
      });
      return {};
    },
    setIdentity(name) {
      const clean = cleanName(name);
      if (!clean) return { error: "Choisis ton prénom." };
      const identity = { id: state.identity?.id || uid(), name: clean.slice(0, 24) };
      dispatch({ type: "set-identity", identity });
      return { identity };
    },
    claimPlayer(playerId) {
      if (!state.identity?.id) return { error: "Crée d'abord ton identité." };
      const player = state.players.find((item) => item.id === playerId);
      if (!player) return { error: "Joueur introuvable." };
      dispatch({
        type: "claim-player",
        playerId,
        identityId: state.identity.id,
        leagueId: player.leagueId,
      });
      return {};
    },
    resetDemo() {
      dispatch({ type: "reset-demo" });
    },
    resetEmpty() {
      dispatch({ type: "reset-empty" });
    },
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
