import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("Supabase : URL ou clé manquante dans .env");
}

export const supabase = createClient(url || "", key || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function isSupabaseConfigured() {
  return Boolean(url && key);
}
