import { useState, useEffect, useMemo } from "react";
import { RECIPES } from "./data/recipes.js";
import { STEPS } from "./data/instructions.js";
import { ING_CAT } from "./data/categories.js";

const CATS = ["Śniadanie", "Obiad", "Kolacja", "Przekąska"];
const CAT_COLORS = { "Śniadanie": "#E8A13C", "Obiad": "#3D7A46", "Kolacja": "#5B6ABF", "Przekąska": "#C2588A" };
const CAT_ICONS = { "Śniadanie": "🌅", "Obiad": "🍲", "Kolacja": "🌙", "Przekąska": "🥜" };
const MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const DOW = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

const byId = {};
RECIPES.forEach(r => { byId[r.id] = r; });

const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtPL = k => { const [y,m,d] = k.split("-"); return `${parseInt(d)} ${MONTHS[parseInt(m)-1].toLowerCase()} ${y}`; };

function aggKey(name){
  let s = name.trim().toLowerCase();
  const ci = s.lastIndexOf(": ");
  if (ci !== -1) s = s.slice(ci + 2);
  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  s = s.replace(/,?\s*śwież\w*(\s+lub\s+mrożon\w+)?$/, "");
  return s.replace(/[\s,]+$/, "").trim();
}
const SHOP_CATS = ["Warzywa", "Owoce", "Pieczywo", "Nabiał i jajka", "Mięso i ryby", "Sypkie i makarony", "Orzechy i bakalie", "Oleje, sosy i konserwy", "Przyprawy", "Słodkie i napoje", "Inne"];
const SHOP_ICONS = { "Warzywa":"🥕", "Owoce":"🍎", "Pieczywo":"🍞", "Nabiał i jajka":"🥛", "Mięso i ryby":"🍗", "Sypkie i makarony":"🌾", "Orzechy i bakalie":"🥜", "Oleje, sosy i konserwy":"🫙", "Przyprawy":"🧂", "Słodkie i napoje":"🍫", "Inne":"🧺" };

function fmtG(g){ return g >= 1000 ? `${(g/1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${Math.round(g*10)/10} g`; }

function MacroChips({ r, size }) {
  const s = size === "sm";
  const chip = (label, val, color) => (
    <span style={{ background: color + "18", color, borderRadius: 20, padding: s ? "2px 8px" : "4px 12px", fontSize: s ? 11 : 13, fontWeight: 600, whiteSpace: "nowrap" }}>
      {label} {val} g
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ background: "#22301F", color: "#fff", borderRadius: 20, padding: s ? "2px 8px" : "4px 12px", fontSize: s ? 11 : 13, fontWeight: 700 }}>{r.kcal} kcal</span>
      {chip("B", r.p, "#3D7A46")}
      {chip("T", r.f, "#E8A13C")}
      {chip("W", r.c, "#5B6ABF")}
    </div>
  );
}

function RecipeThumb({ r, size }) {
  const [err, setErr] = useState(false);
  const src = r.img || `recipes/${r.id}.jpg`;
  if (err) return (
    <div style={{ width: size, height: size, borderRadius: 12, background: CAT_COLORS[r.cat] + "1F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size*0.44), flexShrink: 0 }}>{CAT_ICONS[r.cat]}</div>
  );
  return <img src={src} alt="" onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "#F0F2EC" }} />;
}

const DIETS = [...new Set(RECIPES.map(r => r.diet).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pl"));
const TARGETS = [2400, 2500, 2600, 2700];

function PickerModal({ cat, currentId, ctx, onPick, onPreview, onClose }) {
  const [q, setQ] = useState("");
  const [diet, setDiet] = useState("");
  if (!cat) return null;
  const query = q.trim().toLowerCase();
  const match = r => r.cat === cat && (!diet || r.diet === diet) && (!query || r.name.toLowerCase().includes(query));
  const buckets = {};
  RECIPES.filter(match).forEach(r => {
    const b = Math.round(r.kcal / 100) * 100;
    (buckets[b] = buckets[b] || []).push(r);
  });
  const groups = Object.keys(buckets).map(Number).sort((a, b) => a - b)
    .map(b => ({ label: `~${b} kcal`, items: buckets[b].slice().sort((x, y) => x.kcal - y.kcal || x.name.localeCompare(y.name, "pl")) }));
  const chipStyle = active => ({
    border: active ? "1.5px solid #3D7A46" : "1.5px solid #DDE3D5", background: active ? "#EDF5EA" : "#fff",
    color: active ? "#2A4A32" : "#5C6852", borderRadius: 20, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,18,0.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, maxWidth: 540, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(20,40,20,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid #EEF1E9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, margin: 0, color: "#22301F" }}>{CAT_ICONS[cat]} Wybierz: {cat.toLowerCase()}</h2>
            <button onClick={onClose} style={{ border: "none", background: "#F0F2EC", borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
          {ctx && ctx.filled > 0 && (
            <div style={{ marginTop: 10, background: "#EDF5EA", borderRadius: 10, padding: "7px 11px", fontSize: 12.5, color: "#2A4A32" }}>
              Pozostałe posiłki dnia: <b>{ctx.others} kcal</b> · cel: <b>{ctx.goal} kcal</b> · na ten posiłek zostaje <b>~{ctx.remaining} kcal</b>
            </div>
          )}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj po nazwie…" autoFocus
            style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #DDE3D5", fontSize: 14, fontFamily: "inherit", color: "#22301F" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => setDiet("")} style={chipStyle(!diet)}>Wszystkie</button>
            {DIETS.map(d => <button key={d} onClick={() => setDiet(d === diet ? "" : d)} style={chipStyle(d === diet)}>{d}</button>)}
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "6px 14px 16px" }}>
          {currentId && (
            <button onClick={() => onPick(null)} style={{ width: "100%", border: "1.5px dashed #DDE3D5", background: "#FCFDFA", borderRadius: 12, padding: "10px 12px", fontSize: 13.5, color: "#7A836F", fontWeight: 600, cursor: "pointer", margin: "10px 0 4px" }}>
              ✕ Usuń posiłek z tego dnia
            </button>
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div style={{ position: "sticky", top: 0, background: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#7A836F", padding: "14px 8px 6px" }}>{g.label}</div>
              {g.items.map(r => {
                const isSel = r.id === currentId;
                const fits = ctx && ctx.filled === CATS.length - 1 && Math.abs(r.kcal - ctx.remaining) <= 60;
                return (
                  <div key={r.id} onClick={() => onPick(r.id)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter") onPick(r.id); }}
                    style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 8px", borderRadius: 14, cursor: "pointer",
                      background: isSel ? "#EDF5EA" : "transparent", border: isSel ? "1.5px solid #3D7A46" : "1.5px solid transparent", marginBottom: 2 }}>
                    <RecipeThumb r={r} size={60} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: "#22301F", lineHeight: 1.3 }}>{r.name}</div>
                      <div style={{ fontSize: 12.5, color: "#7A836F", marginTop: 3 }}>
                        <b style={{ color: "#22301F" }}>{r.kcal} kcal</b> · B {r.p} g · T {r.f} g · W {r.c} g{r.time ? <> · <b style={{ color: "#3D7A46" }}>⏱ {r.time} min</b></> : null}{r.diet ? ` · ${r.diet}${r.day ? `, dz. ${r.day}` : ""}` : " · własny"}
                      </div>
                    </div>
                    {fits && <span style={{ background: "#3D7A46", color: "#fff", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓ pasuje</span>}
                    <button onClick={e => { e.stopPropagation(); onPreview(r); }}
                      title="Zobacz przepis"
                      style={{ border: "1.5px solid #DDE3D5", background: "#fff", borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#3D7A46", cursor: "pointer", flexShrink: 0 }}>
                      przepis
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {!groups.length && <div style={{ color: "#96A088", fontSize: 14, textAlign: "center", padding: "26px 0" }}>Brak przepisów dla tych filtrów.</div>}
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ recipe, onClose }) {
  if (!recipe) return null;
  const steps = (STEPS[recipe.id] || "")
    .split("\n")
    .map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,18,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "26px 26px 30px", boxShadow: "0 24px 60px rgba(20,40,20,0.25)" }}>
        <img key={recipe.id} src={recipe.img || `recipes/${recipe.id}.jpg`} alt={recipe.name}
          onError={e => { e.target.style.display = "none"; }}
          style={{ width: "calc(100% + 52px)", margin: "-26px -26px 18px", height: 220, objectFit: "cover", borderRadius: "18px 18px 0 0", display: "block" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: CAT_COLORS[recipe.cat] }}>
              {CAT_ICONS[recipe.cat]} {recipe.cat} · {recipe.diet}, dzień {recipe.day}{recipe.time ? ` · ⏱ ok. ${recipe.time} min` : ""}
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, margin: "6px 0 12px", color: "#22301F", lineHeight: 1.2 }}>{recipe.name}</h2>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#F0F2EC", borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
        <MacroChips r={recipe} />
        {recipe.port > 1 && (
          <div style={{ marginTop: 14, background: "#FDF6E9", border: "1px solid #F0DDB4", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#7A5A16" }}>
            Przepis na {recipe.port} porcje — składniki poniżej dotyczą całego przepisu. Lista zakupów przelicza je na 1 porcję.
          </div>
        )}
        {recipe.note && (
          <div style={{ marginTop: 10, background: "#FBEDED", border: "1px solid #EFC9C9", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#8A3030" }}>{recipe.note}</div>
        )}
        <h3 style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#7A836F", margin: "20px 0 8px" }}>Składniki</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {recipe.ing.map((i, idx) => (
            <li key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: idx < recipe.ing.length-1 ? "1px solid #EEF1E9" : "none", fontSize: 14 }}>
              <span style={{ color: "#2A3524" }}>{i.n}</span>
              <span style={{ color: "#7A836F", textAlign: "right", flexShrink: 0 }}>{i.d}</span>
            </li>
          ))}
        </ul>
        {steps.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#7A836F", margin: "22px 0 10px" }}>Przygotowanie</h3>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {steps.map((s, idx) => (
                <li key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: idx < steps.length-1 ? "1px solid #EEF1E9" : "none" }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, background: "#EDF5EA", color: "#3D7A46", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx+1}</span>
                  <span style={{ fontSize: 14, color: "#2A3524", lineHeight: 1.55 }}>{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const today = new Date();
  const [tab, setTab] = useState("cal");
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(keyOf(today));
  const [plan, setPlan] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [picker, setPicker] = useState(null);
  const [from, setFrom] = useState(keyOf(today));
  const [to, setTo] = useState(keyOf(new Date(today.getTime() + 2*86400000)));
  const [checked, setChecked] = useState({});

  const [eaten, setEaten] = useState({});
  const [goals, setGoals] = useState({ global: 2400, days: {} });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("diet-plan-v1");
      if (saved) setPlan(JSON.parse(saved));
      const savedEaten = localStorage.getItem("diet-eaten-v1");
      if (savedEaten) setEaten(JSON.parse(savedEaten));
      const savedGoals = localStorage.getItem("diet-target-v1");
      if (savedGoals) setGoals(g => ({ ...g, ...JSON.parse(savedGoals) }));
    } catch (e) { /* brak zapisanego planu */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("diet-target-v1", JSON.stringify(goals)); } catch (e) { console.error(e); }
  }, [goals, loaded]);

  const targetFor = k => goals.days[k] || goals.global;

  const setDayGoal = t => setGoals(g => {
    const days = { ...g.days };
    if (t === g.global) delete days[selected]; else days[selected] = t;
    return { ...g, days };
  });

  const makeGlobalGoal = () => setGoals(g => {
    const t = g.days[selected] || g.global;
    const days = { ...g.days };
    delete days[selected];
    return { global: t, days };
  });

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("diet-plan-v1", JSON.stringify(plan)); } catch (e) { console.error(e); }
  }, [plan, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("diet-eaten-v1", JSON.stringify(eaten)); } catch (e) { console.error(e); }
  }, [eaten, loaded]);

  const clearEaten = (dateKey, cat) => setEaten(p => {
    if (!p[dateKey] || !p[dateKey][cat]) return p;
    const day = { ...p[dateKey] };
    delete day[cat];
    const np = { ...p };
    if (Object.keys(day).length) np[dateKey] = day; else delete np[dateKey];
    return np;
  });

  const toggleEaten = (dateKey, cat) => setEaten(p => {
    const day = { ...(p[dateKey] || {}) };
    if (day[cat]) delete day[cat]; else day[cat] = true;
    const np = { ...p };
    if (Object.keys(day).length) np[dateKey] = day; else delete np[dateKey];
    return np;
  });

  const setMeal = (dateKey, cat, id) => {
    clearEaten(dateKey, cat);
    setPlan(p => {
      const day = { ...(p[dateKey] || {}) };
      if (id) day[cat] = id; else delete day[cat];
      const np = { ...p };
      if (Object.keys(day).length) np[dateKey] = day; else delete np[dateKey];
      return np;
    });
  };

  const fillDay = () => {
    setEaten(p => {
      if (!p[selected]) return p;
      const np = { ...p };
      delete np[selected];
      return np;
    });
    const goal = targetFor(selected);
    const pools = CATS.map(cat => RECIPES.filter(r => r.cat === cat));
    const hits = [];
    let best = null, bestDiff = Infinity;
    for (let i = 0; i < 500; i++) {
      const combo = pools.map(pool => pool[Math.floor(Math.random() * pool.length)]);
      const diff = Math.abs(combo.reduce((s, r) => s + r.kcal, 0) - goal);
      if (diff <= 50) hits.push(combo);
      if (diff < bestDiff) { bestDiff = diff; best = combo; }
    }
    const pick = hits.length ? hits[Math.floor(Math.random() * hits.length)] : best;
    setPlan(p => ({ ...p, [selected]: Object.fromEntries(CATS.map((cat, i) => [cat, pick[i].id])) }));
  };

  const dayTotals = dateKey => {
    const day = plan[dateKey]; if (!day) return null;
    let kcal=0,pr=0,f=0,c=0,n=0;
    CATS.forEach(cat => { const r = byId[day[cat]]; if (r){ kcal+=r.kcal; pr+=r.p; f+=r.f; c+=r.c; n++; } });
    return n ? { kcal, p: pr, f, c, n } : null;
  };

  // calendar grid
  const weeks = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const out = [];
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w*7 + d);
        row.push(dt);
      }
      out.push(row);
    }
    return out;
  }, [view]);

  // shopping list
  const shopping = useMemo(() => {
    if (tab !== "shop") return null;
    const items = {}; let meals = 0, kcal = 0; const days = new Set();
    let a = from, b = to; if (a > b) [a, b] = [b, a];
    const d = new Date(a + "T12:00:00"); const end = new Date(b + "T12:00:00");
    while (d <= end) {
      const k = keyOf(d); const day = plan[k];
      if (day) CATS.forEach(cat => {
        const r = byId[day[cat]]; if (!r) return;
        meals++; kcal += r.kcal; days.add(k);
        r.ing.forEach(i => {
          const ak = aggKey(i.n);
          if (ak === "woda") return;
          if (!items[ak]) items[ak] = { name: ak.charAt(0).toUpperCase() + ak.slice(1), g: 0, uses: 0, cat: ING_CAT[ak] || "Inne" };
          items[ak].g += (i.g || 0) / r.port;
          items[ak].uses++;
        });
      });
      d.setDate(d.getDate() + 1);
    }
    const groups = SHOP_CATS.map(cat => ({
      cat,
      items: Object.entries(items).map(([k, v]) => ({ key: k, ...v }))
        .filter(i => i.cat === cat)
        .sort((x, y) => x.name.localeCompare(y.name, "pl"))
    })).filter(g => g.items.length);
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    return { groups, total, meals, kcal, days: days.size };
  }, [tab, from, to, plan]);

  const sel = plan[selected] || {};
  const totals = dayTotals(selected);

  const selectStyle = { width: "100%", padding: "9px 10px", borderRadius: 10, border: "1.5px solid #DDE3D5", background: "#fff", fontSize: 13.5, color: "#22301F", fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9F3", fontFamily: "'Work Sans', system-ui, sans-serif", color: "#22301F" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Work+Sans:wght@400;500;600;700&display=swap');
        select:focus, input:focus, button:focus-visible { outline: 2px solid #3D7A46; outline-offset: 1px; }
        button { font-family: inherit; }
      `}</style>

      <header style={{ background: "#22301F", color: "#F3F6EC", padding: "18px 20px 0" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: 0 }}>Planer diety</h1>
            <span style={{ fontSize: 13, color: "#A9B69B" }}>{RECIPES.length} przepisów · cel {goals.global} kcal</span>
          </div>
          <nav style={{ display: "flex", gap: 6, marginTop: 14 }}>
            {[["cal","📅 Kalendarz"],["shop","🛒 Lista zakupów"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                border: "none", cursor: "pointer", padding: "10px 18px", fontSize: 14, fontWeight: 600,
                borderRadius: "12px 12px 0 0",
                background: tab === id ? "#F7F9F3" : "rgba(255,255,255,0.08)",
                color: tab === id ? "#22301F" : "#D5DEC8"
              }}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "22px 16px 60px" }}>
        {!loaded && <div style={{ color: "#7A836F", fontSize: 14 }}>Wczytywanie planu…</div>}

        {tab === "cal" && loaded && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1.15fr) minmax(300px, 1fr)", gap: 20, alignItems: "start" }}>
            {/* CALENDAR */}
            <section style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 2px 10px rgba(34,48,31,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button onClick={() => setView(v => ({ y: v.m === 0 ? v.y-1 : v.y, m: (v.m+11)%12 }))} style={{ border: "1.5px solid #DDE3D5", background: "#fff", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontSize: 15 }}>‹</button>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 700 }}>{MONTHS[view.m]} {view.y}</div>
                <button onClick={() => setView(v => ({ y: v.m === 11 ? v.y+1 : v.y, m: (v.m+1)%12 }))} style={{ border: "1.5px solid #DDE3D5", background: "#fff", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontSize: 15 }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#96A088", padding: "4px 0", textTransform: "uppercase", letterSpacing: 0.5 }}>{d}</div>)}
                {weeks.flat().map((dt, i) => {
                  const k = keyOf(dt);
                  const inMonth = dt.getMonth() === view.m;
                  const isSel = k === selected;
                  const isToday = k === keyOf(today);
                  const t = dayTotals(k);
                  const day = plan[k] || {};
                  return (
                    <button key={i} onClick={() => setSelected(k)} style={{
                      border: isSel ? "2px solid #3D7A46" : isToday ? "2px solid #C9D6BC" : "2px solid transparent",
                      background: isSel ? "#EDF5EA" : inMonth ? "#F7F9F3" : "#FCFDFA",
                      opacity: inMonth ? 1 : 0.45, borderRadius: 10, padding: "6px 4px 5px",
                      minHeight: 58, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3
                    }}>
                      <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500 }}>{dt.getDate()}</span>
                      <span style={{ display: "flex", gap: 2.5 }}>
                        {CATS.map(c => day[c] ? <span key={c} style={{ width: 6, height: 6, borderRadius: 3, background: CAT_COLORS[c] }} /> : null)}
                      </span>
                      {t && <span style={{ fontSize: 10, color: "#5C6852", fontWeight: 600 }}>{t.kcal}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                {CATS.map(c => (
                  <span key={c} style={{ fontSize: 11.5, color: "#5C6852", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: CAT_COLORS[c] }} />{c}
                  </span>
                ))}
              </div>
            </section>

            {/* DAY PANEL */}
            <section style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 2px 10px rgba(34,48,31,0.06)" }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, margin: "0 0 8px" }}>{fmtPL(selected)}</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#7A836F" }}>🎯 Cel dnia</span>
                {TARGETS.map(t => {
                  const active = targetFor(selected) === t;
                  return (
                    <button key={t} onClick={() => setDayGoal(t)} style={{
                      border: active ? "1.5px solid #3D7A46" : "1.5px solid #DDE3D5",
                      background: active ? "#3D7A46" : "#fff", color: active ? "#fff" : "#5C6852",
                      borderRadius: 20, padding: "4px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer"
                    }}>{t}</button>
                  );
                })}
                {goals.days[selected] && goals.days[selected] !== goals.global && (
                  <button onClick={makeGlobalGoal} title="Użyj tego celu dla wszystkich dni bez własnego celu"
                    style={{ border: "none", background: "none", color: "#3D7A46", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    ustaw jako domyślny
                  </button>
                )}
              </div>

              {totals
                ? (() => {
                    const goal = targetFor(selected);
                    const diff = totals.kcal - goal;
                    const onTrack = Math.abs(diff) <= 50;
                    const barColor = onTrack ? "#3D7A46" : diff > 0 ? "#C25858" : "#E8A13C";
                    const eDay = eaten[selected] || {};
                    let eKcal = 0, eN = 0;
                    CATS.forEach(cat => { const r = byId[sel[cat]]; if (r && eDay[cat]) { eKcal += r.kcal; eN++; } });
                    return (
                      <div style={{ fontSize: 13, color: "#5C6852", marginBottom: 12 }}>
                        Razem: <b style={{ color: "#22301F" }}>{totals.kcal} / {goal} kcal</b>{" "}
                        <b style={{ color: barColor }}>({diff >= 0 ? "+" : ""}{diff})</b> · B {totals.p} g · T {totals.f} g · W {totals.c} g
                        <div style={{ height: 7, background: "#EEF1E9", borderRadius: 4, margin: "7px 0 5px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, totals.kcal / goal * 100)}%`, height: "100%", background: barColor, borderRadius: 4 }} />
                        </div>
                        <div style={{ color: eN ? "#3D7A46" : "#96A088", fontWeight: eN ? 600 : 400 }}>
                          Zjedzone: {eN}/{totals.n} posiłków · {eKcal} kcal
                        </div>
                      </div>
                    );
                  })()
                : <div style={{ fontSize: 13, color: "#96A088", marginBottom: 12 }}>Brak zaplanowanych posiłków — wybierz je poniżej lub wylosuj pod cel dnia.</div>}

              {CATS.map(cat => {
                const r = byId[sel[cat]];
                const isEaten = !!(eaten[selected] || {})[cat];
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: CAT_COLORS[cat] }}>{CAT_ICONS[cat]} {cat}</label>
                      {r && (
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button onClick={() => setModal(r)} style={{ border: "none", background: "none", color: "#3D7A46", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>zobacz przepis</button>
                          <button onClick={() => toggleEaten(selected, cat)} title={isEaten ? "Cofnij oznaczenie" : "Oznacz jako zjedzone"} style={{
                            border: isEaten ? "1.5px solid #3D7A46" : "1.5px solid #DDE3D5",
                            background: isEaten ? "#3D7A46" : "#fff", color: isEaten ? "#fff" : "#7A836F",
                            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
                          }}>{isEaten ? "✓ zjedzone" : "○ zjedzone?"}</button>
                        </span>
                      )}
                    </div>
                    <button onClick={() => setPicker(cat)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                      padding: r ? "8px 10px" : "14px 12px", borderRadius: 12, cursor: "pointer",
                      border: isEaten ? "1.5px solid #C9D6BC" : "1.5px solid #DDE3D5",
                      background: isEaten ? "#F4F8F0" : "#fff", opacity: isEaten ? 0.75 : 1
                    }}>
                      {r ? (
                        <>
                          <RecipeThumb r={r} size={48} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#22301F", lineHeight: 1.3 }}>{r.name}</div>
                            <div style={{ marginTop: 4 }}><MacroChips r={r} size="sm" /></div>
                          </div>
                          <span style={{ color: "#96A088", fontSize: 15, flexShrink: 0 }}>›</span>
                        </>
                      ) : (
                        <span style={{ color: "#96A088", fontSize: 13.5, fontWeight: 600 }}>+ Wybierz posiłek…</span>
                      )}
                    </button>
                  </div>
                );
              })}

              <div style={{ marginTop: 18, borderTop: "1px dashed #DDE3D5", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#7A836F", marginBottom: 8 }}>Szybkie wypełnienie dnia</div>
                <button onClick={fillDay} style={{ background: "#3D7A46", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>🎲 Wylosuj dzień pod {targetFor(selected)} kcal</button>
                <div style={{ fontSize: 12, color: "#96A088", marginTop: 6 }}>Losuje komplet 4 posiłków tak, aby suma trafiła w cel dnia (±50 kcal). Kliknij ponownie, jeśli zestaw Ci nie pasuje — pojedyncze posiłki możesz potem zmienić.</div>
              </div>
            </section>
          </div>
        )}

        {tab === "shop" && loaded && (
          <section style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 10px rgba(34,48,31,0.06)", maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 21, margin: "0 0 12px" }}>Lista zakupów</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5C6852", display: "block", marginBottom: 4 }}>Od</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selectStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5C6852", display: "block", marginBottom: 4 }}>Do</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selectStyle} />
              </div>
            </div>

            {shopping && shopping.total > 0 ? (
              <>
                <div style={{ background: "#EDF5EA", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#2A4A32", marginBottom: 14 }}>
                  <b>{shopping.days}</b> dni z planem · <b>{shopping.meals}</b> posiłków · <b>{shopping.kcal}</b> kcal łącznie
                  <div style={{ fontSize: 12, color: "#5C6852", marginTop: 3 }}>Ilości przeliczone na 1 porcję każdego przepisu i zsumowane.</div>
                </div>
                {shopping.groups.map(group => {
                  const doneIn = group.items.filter(i => checked[i.key]).length;
                  return (
                    <div key={group.cat} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", background: "#F0F4EB", borderRadius: 10, padding: "7px 12px", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#3A4A32" }}>{SHOP_ICONS[group.cat]} {group.cat}</span>
                        <span style={{ fontSize: 12, color: "#7A836F", fontWeight: 600 }}>{doneIn}/{group.items.length}</span>
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {group.items.map(item => {
                          const done = checked[item.key];
                          return (
                            <li key={item.key}>
                              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #EEF1E9", cursor: "pointer", opacity: done ? 0.45 : 1 }}>
                                <input type="checkbox" checked={!!done} onChange={() => setChecked(c => ({ ...c, [item.key]: !c[item.key] }))} style={{ width: 17, height: 17, accentColor: "#3D7A46" }} />
                                <span style={{ flex: 1, fontSize: 14.5, textDecoration: done ? "line-through" : "none" }}>{item.name}</span>
                                <span style={{ fontWeight: 700, fontSize: 14, color: "#22301F" }}>{fmtG(item.g)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                <div style={{ fontSize: 12.5, color: "#96A088", marginTop: 4 }}>Odhaczone: {Object.values(checked).filter(Boolean).length} / {shopping.total}</div>
              </>
            ) : (
              <div style={{ color: "#96A088", fontSize: 14, padding: "24px 0", textAlign: "center" }}>
                Brak posiłków w wybranym zakresie dat.<br />Zaplanuj dietę w zakładce Kalendarz, a lista pojawi się tutaj.
              </div>
            )}
          </section>
        )}
      </main>

      <PickerModal cat={picker} currentId={picker ? (plan[selected] || {})[picker] : null}
        ctx={picker ? (() => {
          const day = plan[selected] || {};
          let others = 0, filled = 0;
          CATS.forEach(c => { if (c !== picker) { const r = byId[day[c]]; if (r) { others += r.kcal; filled++; } } });
          const goal = targetFor(selected);
          return { others, filled, goal, remaining: goal - others };
        })() : null}
        onPick={id => { setMeal(selected, picker, id); setPicker(null); }}
        onPreview={r => setModal(r)}
        onClose={() => setPicker(null)} />
      <RecipeModal recipe={modal} onClose={() => setModal(null)} />

      <style>{`
        @media (max-width: 760px) {
          main > div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
