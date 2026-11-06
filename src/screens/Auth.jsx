import { useState } from "react";
import { useAuth } from "../auth";
import { Mark } from "../ui";

export default function Auth() {
  const auth = useAuth();
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (tab === "login") {
        await auth.login(email, password);
      } else {
        await auth.register(email, password, name);
        setInfo("Compte créé. Si la confirmation email est activée, ouvre le mail puis reconnecte-toi. Sinon tu es déjà dedans.");
        await auth.login(email, password).catch(() => {});
      }
    } catch (err) {
      setError(err.message || "Impossible de continuer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack auth-screen">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <strong>Tourne</strong>
            <span>Ligue de padel</span>
          </div>
        </div>
      </header>

      <p className="pitch">Crée ou rejoins une ligue. Les 4 joueurs du match valident le score.</p>

      <section className="section stack">
        <div className="seg" role="group" aria-label="Connexion">
          <button type="button" aria-pressed={tab === "login"} onClick={() => setTab("login")}>
            Connexion
          </button>
          <button type="button" aria-pressed={tab === "signup"} onClick={() => setTab("signup")}>
            Inscription
          </button>
        </div>

        <form className="stack" onSubmit={submit}>
          {tab === "signup" ? (
            <label className="field">
              Prénom
              <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Hugo" />
            </label>
          ) : null}
          <label className="field">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            Mot de passe
            <input
              type="password"
              required
              minLength={6}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {info ? <p className="note">{info}</p> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "…" : tab === "login" ? "Entrer" : "Créer mon compte"}
          </button>
        </form>
      </section>

      <button type="button" className="btn" onClick={() => auth.useLocal()}>
        Continuer en local (sans compte)
      </button>
      <p className="note">Le mode local reste sur cet appareil. Le cloud synchronise les ligues entre joueurs.</p>
    </div>
  );
}
