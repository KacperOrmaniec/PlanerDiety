import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabaseClient.js";
import Auth from "./Auth.jsx";
import App from "./App.jsx";

const CARD = { minHeight: "100vh", background: "#F7F9F3", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Work Sans', system-ui, sans-serif" };

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
        <div style={{ maxWidth: 420, background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 10px rgba(34,48,31,0.06)", color: "#22301F" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, margin: "0 0 10px" }}>Brak konfiguracji Supabase</h2>
          <p style={{ fontSize: 13.5, color: "#5C6852", lineHeight: 1.5, margin: 0 }}>
            Utwórz plik <code>.env.local</code> na podstawie <code>.env.example</code> i uzupełnij{" "}
            <code>VITE_SUPABASE_URL</code> oraz <code>VITE_SUPABASE_ANON_KEY</code>, a następnie zrestartuj{" "}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return <div style={{ ...CARD, color: "#7A836F", fontSize: 14 }}>Wczytywanie…</div>;
  }

  return session ? <App session={session} /> : <Auth />;
}
