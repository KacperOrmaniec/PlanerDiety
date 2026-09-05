import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabaseClient.js";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const INK = "#1C1C1E";
const MUTED = "#8E8E93";
const SCREEN = {
  minHeight: "100dvh", background: "#F4F4F7", display: "flex", alignItems: "center",
  justifyContent: "center", padding: 24, fontFamily: FONT, color: INK, WebkitFontSmoothing: "antialiased"
};

export default function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <div style={SCREEN}>
        <div style={{ maxWidth: 420, background: "#fff", borderRadius: 22, padding: 26,
          boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 12px 32px rgba(16,24,40,.08)" }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 10px", letterSpacing: -0.4 }}>Brak konfiguracji Supabase</h2>
          <p style={{ fontSize: 14, color: "#55555C", lineHeight: 1.6, margin: 0 }}>
            Utwórz plik <code>.env.local</code> na podstawie <code>.env.example</code> i uzupełnij{" "}
            <code>VITE_SUPABASE_URL</code> oraz <code>VITE_SUPABASE_ANON_KEY</code>, a następnie zrestartuj{" "}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return <div style={{ ...SCREEN, color: MUTED, fontSize: 14 }}>Wczytywanie…</div>;
  }

  return session ? <App session={session} /> : <Auth />;
}
