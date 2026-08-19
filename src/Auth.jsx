import { useState } from "react";
import { supabase } from "./lib/supabaseClient.js";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (mode === "signup") setInfo("Sprawdź skrzynkę e-mail, aby potwierdzić konto, a potem się zaloguj.");
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #DDE3D5", fontSize: 14, fontFamily: "inherit", color: "#22301F" };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9F3", fontFamily: "'Work Sans', system-ui, sans-serif", color: "#22301F", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Work+Sans:wght@400;500;600;700&display=swap');
        input:focus, button:focus-visible { outline: 2px solid #3D7A46; outline-offset: 1px; }
      `}</style>
      <div style={{ background: "#fff", borderRadius: 16, padding: 30, width: "100%", maxWidth: 380, boxShadow: "0 2px 10px rgba(34,48,31,0.06)" }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, margin: "0 0 4px" }}>Planer diety</h1>
        <p style={{ fontSize: 13.5, color: "#7A836F", margin: "0 0 22px" }}>
          {mode === "signin" ? "Zaloguj się, aby zobaczyć swój plan." : "Załóż konto, aby zapisać swój plan."}
        </p>
        <form onSubmit={submit}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#5C6852", display: "block", marginBottom: 4 }}>E-mail</label>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />

          <label style={{ fontSize: 12, fontWeight: 600, color: "#5C6852", display: "block", margin: "14px 0 4px" }}>Hasło</label>
          <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />

          {error && <div style={{ marginTop: 14, background: "#FBEDED", border: "1px solid #EFC9C9", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#8A3030" }}>{error}</div>}
          {info && <div style={{ marginTop: 14, background: "#EDF5EA", border: "1px solid #C9D6BC", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#2A4A32" }}>{info}</div>}

          <button type="submit" disabled={busy} style={{
            width: "100%", marginTop: 18, background: "#3D7A46", color: "#fff", border: "none", borderRadius: 10,
            padding: "11px 18px", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1
          }}>
            {busy ? "Chwileczkę…" : mode === "signin" ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </form>
        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
          style={{ marginTop: 16, width: "100%", border: "none", background: "none", color: "#3D7A46", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
          {mode === "signin" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
        </button>
      </div>
    </div>
  );
}
