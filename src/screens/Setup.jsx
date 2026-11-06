import { useState } from "react";
import { Mark } from "../ui";
import { useAuth } from "../auth";
import { supabase } from "../supabase";

export default function Setup({ onReady }) {
  const auth = useAuth();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function check() {
    setChecking(true);
    setError("");
    try {
      const { error: probe } = await supabase.from("leagues").select("id").limit(1);
      if (probe && probe.code === "PGRST205") {
        setError("Les tables ne sont pas encore créées. Lance le SQL dans Supabase.");
        setOk(false);
      } else if (probe) {
        setError(probe.message);
        setOk(false);
      } else {
        setOk(true);
        onReady?.();
      }
    } catch (err) {
      setError(err.message || "Connexion impossible.");
      setOk(false);
    } finally {
      setChecking(false);
    }
  }

  async function copySql() {
    try {
      const res = await fetch("/schema.sql");
      if (!res.ok) throw new Error("Fichier schema introuvable");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setError("");
      setOk(false);
      alert("SQL copié. Colle-le dans Supabase → SQL Editor → Run.");
    } catch {
      alert("Ouvre le fichier supabase/schema.sql dans le projet et copie-le manuellement.");
    }
  }

  return (
    <div className="stack auth-screen">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Tourne</strong>
            <span>Installation cloud</span>
          </div>
        </div>
      </header>

      <section className="section stack">
        <h2>Une fois dans Supabase</h2>
        <ol className="setup-steps">
          <li>Ouvre ton projet → <b>SQL Editor</b> → New query</li>
          <li>Colle le contenu de <b>supabase/schema.sql</b></li>
          <li>Clique <b>Run</b></li>
          <li>
            Auth → Providers → Email → désactive <b>Confirm email</b> (pour tester)
          </li>
        </ol>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={copySql}>
            Copier le SQL
          </button>
          <button type="button" className="btn" onClick={check} disabled={checking}>
            {checking ? "Vérif…" : "Vérifier"}
          </button>
        </div>
        {ok ? <p className="note">Schéma OK. Tu peux t'inscrire.</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <button type="button" className="btn" onClick={() => auth.useLocal()}>
        Continuer en local sans cloud
      </button>
    </div>
  );
}
