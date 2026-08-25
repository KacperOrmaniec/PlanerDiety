import { useState } from "react";
import { supabase } from "./lib/supabaseClient.js";

const INK = "#141210";
const CREAM = "#EFE7D8";
const PAPER = "#FBF7EE";
const RED = "#E2452F";
const MUTED = "#6E6656";
const SANS = "'Bricolage Grotesque', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

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

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `2px solid ${INK}`, background: PAPER, fontSize: 14, fontFamily: SANS, fontWeight: 500, color: INK };
  const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 5 };

  return (
    <div style={{ minHeight: "100dvh", background: CREAM, fontFamily: SANS, color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))" }}>
      <style>{`
        button { font-family: inherit; border-radius: 0; }
        input { border-radius: 0; }
        input:focus, button:focus-visible { outline: 3px solid ${RED}; outline-offset: 2px; }
        .b { transition: transform .07s ease, box-shadow .07s ease; }
        .b:active { transform: translate(3px, 3px); box-shadow: none !important; }
      `}</style>
      <div style={{ background: PAPER, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, padding: 26, width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontFamily: SANS, fontSize: 27, fontWeight: 800, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: -0.8, lineHeight: 1 }}>Planer diety</h1>
        <p style={{ fontSize: 11, color: MUTED, margin: "0 0 24px", fontFamily: MONO, lineHeight: 1.5 }}>
          {mode === "signin" ? "Zaloguj się, aby zobaczyć swój plan." : "Załóż konto, aby zapisać swój plan."}
        </p>
        <form onSubmit={submit}>
          <label style={labelStyle}>E-mail</label>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />

          <div style={{ height: 14 }} />
          <label style={labelStyle}>Hasło</label>
          <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />

          {error && <div style={{ marginTop: 14, background: RED, border: `2px solid ${INK}`, padding: "9px 11px", fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{error}</div>}
          {info && <div style={{ marginTop: 14, background: "#0F8B5F", border: `2px solid ${INK}`, padding: "9px 11px", fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{info}</div>}

          <button type="submit" disabled={busy} className="b" style={{
            width: "100%", marginTop: 20, background: busy ? MUTED : RED, color: "#fff",
            border: `2px solid ${INK}`, boxShadow: busy ? "none" : `4px 4px 0 ${INK}`,
            padding: "12px 18px", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer",
            textTransform: "uppercase", letterSpacing: 1
          }}>
            {busy ? "Chwileczkę…" : mode === "signin" ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </form>
        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
          style={{ marginTop: 18, width: "100%", border: "none", background: "none", color: INK, fontSize: 10.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textTransform: "uppercase", letterSpacing: 0.6 }}>
          {mode === "signin" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
        </button>
      </div>
    </div>
  );
}
