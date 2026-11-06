import { createContext, useContext, useEffect, useState } from "react";
import { getProfile, getSession, signIn, signOut, signUp } from "./cloud";
import { isSupabaseConfigured, supabase } from "./supabase";

const AuthContext = createContext(null);
const MODE_KEY = "tourne-auth-mode";

function initialMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "cloud" || saved === "local") return saved;
  } catch {
    // ignore
  }
  // Par défaut : l'app locale s'ouvre tout de suite.
  return "local";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState(initialMode);

  function setMode(next) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setMode("local");
      setLoading(false);
      return undefined;
    }

    let alive = true;
    const timeout = window.setTimeout(() => {
      if (alive) setLoading(false);
    }, 2500);

    getSession()
      .then(async (current) => {
        if (!alive) return;
        setSession(current);
        if (current) {
          try {
            setProfile(await getProfile());
          } catch {
            setProfile(null);
          }
        }
      })
      .catch(() => {
        // Réseau / auth KO : on reste utilisable en local.
      })
      .finally(() => {
        if (alive) setLoading(false);
        window.clearTimeout(timeout);
      });

    const { data } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        try {
          setProfile(await getProfile());
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      alive = false;
      window.clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = {
    configured: isSupabaseConfigured(),
    loading,
    session,
    profile,
    user: session?.user || null,
    mode,
    useLocal() {
      setMode("local");
    },
    useCloud() {
      setMode("cloud");
    },
    async register(email, password, displayName) {
      await signUp(email, password, displayName);
    },
    async login(email, password) {
      await signIn(email, password);
      setMode("cloud");
    },
    async logout() {
      await signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Auth manquant");
  return ctx;
}
