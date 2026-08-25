import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabaseClient.js";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

const INK = "#141210";
const CARD = { minHeight: "100dvh", background: "#EFE7D8", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" };

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
      <div style={CARD}>
        <div style={{ maxWidth: 420, background: "#FBF7EE", border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, padding: 22, color: INK }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: -0.4 }}>Brak konfiguracji Supabase</h2>
          <p style={{ fontSize: 13, color: "#6E6656", lineHeight: 1.6, margin: 0 }}>
            Utwórz plik <code>.env.local</code> na podstawie <code>.env.example</code> i uzupełnij{" "}
            <code>VITE_SUPABASE_URL</code> oraz <code>VITE_SUPABASE_ANON_KEY</code>, a następnie zrestartuj{" "}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return <div style={{ ...CARD, color: "#6E6656", fontSize: 13, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Wczytywanie…</div>;
  }

  return session ? <App session={session} /> : <Auth />;
}
