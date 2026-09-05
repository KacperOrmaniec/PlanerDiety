import { useState } from "react";
import { supabase } from "./lib/supabaseClient.js";

// Mirrors the token set in App.jsx: one typeface, white card on a near-white ground,
// hairline outlines, soft radii and the same light-green accent on the primary action.
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const GREEN = "#34C759";
const GREEN_SOFT = "#E9F9EE";
const GREEN_DEEP = "#1B8A3C";
const BG = "#F4F4F7";
const CARD = "#FFFFFF";
const INK = "#1C1C1E";
const INK_SOFT = "#55555C";
const MUTED = "#8E8E93";
const LINE = "#EAEAEF";
const FILL = "#F2F2F6";
const RED_SOFT = "#FFECEA";
const RED_DEEP = "#C0261C";

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

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14,
    border: `1px solid ${LINE}`, background: FILL, fontSize: 15, fontWeight: 500, color: INK
  };
  const labelStyle = { fontSize: 12.5, fontWeight: 600, color: INK_SOFT, display: "block", marginBottom: 6 };
  const noteStyle = { marginTop: 16, borderRadius: 14, padding: "11px 13px", fontSize: 13, fontWeight: 500, lineHeight: 1.5 };

  return (
    <div style={{
      minHeight: "100dvh", background: BG, fontFamily: FONT, color: INK, WebkitFontSmoothing: "antialiased",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))"
    }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button, input, textarea, select { font-family: inherit; }
        input:focus-visible, button:focus-visible { outline: 2px solid ${GREEN}; outline-offset: 2px; }
        .press { transition: transform .14s cubic-bezier(.2,.8,.3,1), box-shadow .14s ease, background-color .14s ease; }
        .press:active { transform: scale(.985); }
      `}</style>

      <div style={{
        background: CARD, borderRadius: 22, boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 12px 32px rgba(16,24,40,.08)",
        padding: 28, width: "100%", maxWidth: 400
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, background: GREEN_SOFT, color: GREEN_DEEP,
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3v7a3 3 0 006 0V3M11 3v18M16.5 3c-1.4 1.6-2 3.6-2 5.5 0 1.7.7 2.9 2 3.3V21" />
          </svg>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: -0.7 }}>Planer diety</h1>
        <p style={{ fontSize: 14, color: MUTED, margin: "0 0 24px", lineHeight: 1.5 }}>
          {mode === "signin" ? "Zaloguj się, aby zobaczyć swój plan." : "Załóż konto, aby zapisać swój plan."}
        </p>

        <form onSubmit={submit}>
          <label style={labelStyle}>E-mail</label>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />

          <div style={{ height: 14 }} />
          <label style={labelStyle}>Hasło</label>
          <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />

          {error && <div style={{ ...noteStyle, background: RED_SOFT, color: RED_DEEP }}>{error}</div>}
          {info && <div style={{ ...noteStyle, background: GREEN_SOFT, color: GREEN_DEEP }}>{info}</div>}

          <button type="submit" disabled={busy} className="press" style={{
            width: "100%", marginTop: 22, background: busy ? "#B9E7C6" : GREEN, color: "#fff",
            border: "none", borderRadius: 14, padding: "14px 18px", fontWeight: 600, fontSize: 15,
            cursor: busy ? "default" : "pointer", boxShadow: busy ? "none" : "0 6px 18px rgba(52,199,89,.30)"
          }}>
            {busy ? "Chwileczkę…" : mode === "signin" ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </form>

        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
          style={{ marginTop: 18, width: "100%", border: "none", background: "none", color: INK_SOFT,
            fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: 4 }}>
          {mode === "signin" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
        </button>
      </div>
    </div>
  );
}
