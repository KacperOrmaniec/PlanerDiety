import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { RECIPES } from "./data/recipes.js";
import { STEPS } from "./data/instructions.js";
import { ING_CAT } from "./data/categories.js";
import { supabase } from "./lib/supabaseClient.js";

// --- Design tokens -------------------------------------------------------
// Warm brutalism: cream paper, heavy ink rules, flat saturated color, hard
// offset shadows instead of blur, square corners, no decorative emoji.
const INK = "#141210";
const CREAM = "#EFE7D8";
const PAPER = "#FBF7EE";
const RED = "#E2452F";
const MUTED = "#6E6656";
const RULE = `2px solid ${INK}`;
const RULE_THIN = `1.5px solid ${INK}`;
const RULE_THICK = `3px solid ${INK}`;
const HARD = `5px 5px 0 ${INK}`;
const HARD_SM = `3px 3px 0 ${INK}`;
const SANS = "'Bricolage Grotesque', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const CATS = ["Śniadanie", "Obiad", "Kolacja", "Przekąska"];
const CAT_COLORS = { "Śniadanie": "#F0A202", "Obiad": "#0F8B5F", "Kolacja": "#3D4FD1", "Przekąska": "#D6336C" };
const CAT_MARK = { "Śniadanie": "Ś", "Obiad": "O", "Kolacja": "K", "Przekąska": "P" };
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

function fmtG(g){ return g >= 1000 ? `${(g/1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${Math.round(g*10)/10} g`; }

// Shared building blocks -------------------------------------------------
const label = (extra = {}) => ({
  fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
  fontFamily: SANS, color: INK, ...extra
});

function MacroChips({ r, size }) {
  const s = size === "sm";
  const pad = s ? "1px 5px" : "3px 8px";
  const fs = s ? 10 : 11.5;
  const macro = (letter, val, color) => (
    <span style={{ background: PAPER, border: RULE_THIN, padding: pad, fontSize: fs, fontFamily: MONO, fontWeight: 500, color: INK, whiteSpace: "nowrap" }}>
      <b style={{ color, fontWeight: 700 }}>{letter}</b> {val}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ background: INK, color: CREAM, border: RULE_THIN, padding: pad, fontSize: fs, fontFamily: MONO, fontWeight: 700, whiteSpace: "nowrap" }}>{r.kcal} KCAL</span>
      {macro("B", r.p, "#0F8B5F")}
      {macro("T", r.f, "#F0A202")}
      {macro("W", r.c, "#3D4FD1")}
    </div>
  );
}

function RecipeThumb({ r, size }) {
  const [err, setErr] = useState(false);
  const src = r.img || `recipes/${r.id}.jpg`;
  if (err) return (
    <div style={{ width: size, height: size, background: CAT_COLORS[r.cat], border: RULE, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: SANS, fontSize: Math.round(size*0.46), fontWeight: 800, color: "#fff" }}>{CAT_MARK[r.cat]}</div>
  );
  return <img src={src} alt="" loading="lazy" onError={() => setErr(true)}
    style={{ width: size, height: size, border: RULE, objectFit: "cover", flexShrink: 0, background: CREAM, display: "block" }} />;
}

// "Wylosuj dzień": pick one recipe per category summing to within tolerance of the day's goal.
// Recipes are drawn across all five diets on purpose - the 70 designed (diet, day) sets only cover
// a handful of totals (exactly one lands within 50 kcal of 2600), so locking a draw to one diet
// would leave most targets unreachable.
const POOLS = CATS.map(cat => RECIPES.filter(r => r.cat === cat));
const TOLERANCES = [50, 100, 200, 400, Infinity];

// How many kcal totals categories i..end can reach, and in how many ways: SUMS[i].counts[k] is the
// number of combinations totalling SUMS[i].min + k kcal, with a prefix sum for O(1) window queries.
// Sampling each category weighted by how many days can still be completed behind it is what makes
// a draw uniform over every fitting day. Picking blindly (500 random combos, or first-fit
// backtracking) skews hard once a target nears the top of the reachable 2256-2787 kcal range: the
// same near-maximum meals keep coming back because few combinations reach that high.
const SUMS = [{ min: 0, counts: [1] }];
for (let i = POOLS.length - 1; i >= 0; i--) {
  const rest = SUMS[0];
  const kcals = POOLS[i].map(r => r.kcal);
  const min = rest.min + Math.min(...kcals);
  const counts = new Float64Array(rest.counts.length + Math.max(...kcals) - Math.min(...kcals));
  for (const k of kcals)
    for (let j = 0; j < rest.counts.length; j++) counts[rest.min + j + k - min] += rest.counts[j];
  SUMS.unshift({ min, counts });
}
for (const s of SUMS) {
  s.pre = new Float64Array(s.counts.length + 1);
  for (let i = 0; i < s.counts.length; i++) s.pre[i + 1] = s.pre[i] + s.counts[i];
}

// Number of ways categories i..end land within `tol` of `rem` kcal.
function waysWithin(i, rem, tol) {
  const s = SUMS[i];
  let lo = Math.ceil(rem - tol) - s.min, hi = Math.floor(rem + tol) - s.min;
  lo = Number.isFinite(lo) ? Math.max(0, lo) : 0;
  hi = Number.isFinite(hi) ? Math.min(s.counts.length - 1, hi) : s.counts.length - 1;
  return hi < lo ? 0 : s.pre[hi + 1] - s.pre[lo];
}

function drawDay(goal) {
  const tol = TOLERANCES.find(t => waysWithin(0, goal, t) > 0); // widened only if nothing fits
  const out = [];
  let rem = goal;
  for (let i = 0; i < POOLS.length; i++) {
    const weights = POOLS[i].map(r => waysWithin(i + 1, rem - r.kcal, tol));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0), k = 0;
    while (k < weights.length - 1 && x >= weights[k]) { x -= weights[k]; k++; }
    out.push(POOLS[i][k]);
    rem -= POOLS[i][k].kcal;
  }
  return out;
}

// Shopping-list ticks: kept per date range so they reset when you plan a different trip, and
// in localStorage (not Supabase) because a half-ticked list belongs to the phone in the shop.
const shopKey = userId => `shop-checked-${userId}`;
const rangeOf = (a, b) => (a <= b ? `${a}..${b}` : `${b}..${a}`);
const NO_TICKS = {};

function readShopChecked(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(shopKey(userId)));
    return v && v.items ? v : { range: "", items: NO_TICKS };
  } catch { return { range: "", items: NO_TICKS }; }
}

// Diets are grouped by the calorie level they actually plan for, not by their spreadsheet name:
// each "Dieta N" is 14 designed days, and diets whose average day lands within GROUP_TOL of each
// other (all of them, not just pairwise neighbours) are one and the same plan as far as anyone
// choosing a meal is concerned. In the current
// base that joins Dieta 1-4 (2397-2410 kcal/day) into "2400 kcal" and leaves Dieta 5 (2699) as
// "2700 kcal". Derived from RECIPES so it stays right when the base is regenerated from Excel.
const GROUP_TOL = 100;

const DIET_GROUPS = (() => {
  const dayKcal = {};                                  // `${diet}|${day}` -> kcal of that designed day
  for (const r of RECIPES) {
    if (!r.diet) continue;
    const k = `${r.diet}|${r.day}`;
    dayKcal[k] = (dayKcal[k] || 0) + r.kcal;
  }
  const perDiet = {};
  for (const [k, kcal] of Object.entries(dayKcal)) {
    const diet = k.slice(0, k.lastIndexOf("|"));
    (perDiet[diet] = perDiet[diet] || []).push(kcal);
  }
  const means = Object.entries(perDiet)
    .map(([diet, days]) => ({ diet, mean: days.reduce((a, b) => a + b, 0) / days.length }))
    .sort((a, b) => a.mean - b.mean);

  // Compared against the lightest diet already in the cluster (the list is sorted), so a group
  // never chains: every diet in one is within GROUP_TOL of every other, not just of its neighbour.
  const clusters = [];
  for (const d of means) {
    const last = clusters[clusters.length - 1];
    if (last && d.mean - last.means[0] <= GROUP_TOL) { last.diets.push(d.diet); last.means.push(d.mean); }
    else clusters.push({ diets: [d.diet], means: [d.mean] });
  }
  return clusters.map(c => {
    const mean = c.means.reduce((a, b) => a + b, 0) / c.means.length;
    const kcal = Math.round(mean / 100) * 100;
    return { kcal, label: `${kcal} kcal`, diets: c.diets };
  });
})();

// recipe's diet -> the group it belongs to, for filtering and for the "plan" line on a recipe
const GROUP_OF = {};
DIET_GROUPS.forEach(g => g.diets.forEach(d => { GROUP_OF[d] = g; }));
const TARGETS = [2400, 2500, 2600, 2700];
const DEFAULT_GOALS = { global: 2400, days: {} };

const closeBtn = {
  border: RULE, background: PAPER, color: INK, width: 34, height: 34,
  fontSize: 17, fontWeight: 700, cursor: "pointer", flexShrink: 0, lineHeight: 1, fontFamily: SANS
};

// Rendered only while open (and therefore remounted on every open), so the search box and diet
// filter always start empty instead of carrying over from the last category that was picked.
function PickerModal({ cat, currentId, ctx, onPick, onPreview, onClose }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(null);
  const query = q.trim().toLowerCase();
  const match = r => r.cat === cat && (!group || GROUP_OF[r.diet] === group) && (!query || r.name.toLowerCase().includes(query));
  const buckets = {};
  RECIPES.filter(match).forEach(r => {
    const b = Math.round(r.kcal / 100) * 100;
    (buckets[b] = buckets[b] || []).push(r);
  });
  const groups = Object.keys(buckets).map(Number).sort((a, b) => a - b)
    .map(b => ({ label: `~${b} kcal`, items: buckets[b].slice().sort((x, y) => x.kcal - y.kcal || x.name.localeCompare(y.name, "pl")) }));
  const chipStyle = active => ({
    border: RULE, background: active ? INK : PAPER, color: active ? CREAM : INK,
    padding: "6px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    textTransform: "uppercase", letterSpacing: 0.6, fontFamily: SANS
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,0.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: RULE_THICK, maxWidth: 540, width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", boxShadow: HARD, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 14px", borderBottom: RULE, background: CREAM }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, margin: 0, color: INK, textTransform: "uppercase", letterSpacing: -0.3 }}>
              <span style={{ background: CAT_COLORS[cat], color: "#fff", border: RULE_THIN, padding: "1px 7px", marginRight: 8, fontSize: 15 }}>{CAT_MARK[cat]}</span>
              {cat}
            </h2>
            <button onClick={onClose} className="b" style={closeBtn}>×</button>
          </div>
          {ctx && ctx.filled > 0 && (
            <div style={{ marginTop: 10, background: PAPER, border: RULE_THIN, padding: "7px 10px", fontSize: 11.5, color: INK, fontFamily: MONO }}>
              Reszta dnia <b>{ctx.others}</b> · cel <b>{ctx.goal}</b> · zostaje <b style={{ color: RED }}>~{ctx.remaining} kcal</b>
            </div>
          )}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj po nazwie…" autoFocus
            style={{ width: "100%", boxSizing: "border-box", marginTop: 10, padding: "9px 11px", border: RULE, background: PAPER, fontSize: 14, fontFamily: SANS, fontWeight: 500, color: INK }} />
          <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...label(), color: MUTED, marginRight: 3 }}>Plan</span>
            <button onClick={() => setGroup(null)} style={chipStyle(!group)}>Wszystkie</button>
            {DIET_GROUPS.map(g => (
              <button key={g.label} onClick={() => setGroup(g === group ? null : g)} style={chipStyle(g === group)}>{g.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 14px 16px" }}>
          {currentId && (
            <button onClick={() => onPick(null)} className="b" style={{ width: "100%", border: RULE, background: PAPER, boxShadow: HARD_SM, padding: "10px 12px", fontSize: 12, color: INK, fontWeight: 700, cursor: "pointer", margin: "14px 0 4px", textTransform: "uppercase", letterSpacing: 0.6, fontFamily: SANS }}>
              × Usuń posiłek z tego dnia
            </button>
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div style={{ position: "sticky", top: 0, zIndex: 1, background: PAPER, borderBottom: RULE, ...label(), fontSize: 11.5, padding: "14px 0 5px", fontFamily: MONO, fontWeight: 700 }}>{g.label}</div>
              {g.items.map(r => {
                const isSel = r.id === currentId;
                const fits = ctx && ctx.filled === CATS.length - 1 && Math.abs(r.kcal - ctx.remaining) <= 60;
                return (
                  <div key={r.id} onClick={() => onPick(r.id)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.id); } }}
                    style={{ display: "flex", gap: 11, alignItems: "center", padding: "9px 8px", cursor: "pointer",
                      background: isSel ? CAT_COLORS[cat] + "22" : "transparent",
                      border: isSel ? RULE : "2px solid transparent", marginTop: 6 }}>
                    <RecipeThumb key={r.id} r={r} size={58} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.25, fontFamily: SANS }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontFamily: MONO, lineHeight: 1.5 }}>
                        <b style={{ color: INK }}>{r.kcal} kcal</b> · B {r.p} · T {r.f} · W {r.c}{r.time ? ` · ${r.time} min` : ""}{GROUP_OF[r.diet] ? ` · plan ${GROUP_OF[r.diet].kcal}` : " · własny"}
                      </div>
                    </div>
                    {fits && <span style={{ background: RED, color: "#fff", border: RULE_THIN, padding: "2px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: SANS }}>Pasuje</span>}
                    <button onClick={e => { e.stopPropagation(); onPreview(r); }} title="Zobacz przepis"
                      style={{ border: RULE_THIN, background: PAPER, padding: "5px 9px", fontSize: 10.5, fontWeight: 700, color: INK, cursor: "pointer", flexShrink: 0, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: SANS }}>
                      Przepis
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {!groups.length && <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: "26px 0", fontFamily: SANS }}>Brak przepisów dla tych filtrów.</div>}
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ recipe, onClose }) {
  const steps = (STEPS[recipe.id] || "")
    .split("\n")
    .map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PAPER, border: RULE_THICK, maxWidth: 560, width: "100%", maxHeight: "85dvh", overflowY: "auto", padding: "22px 22px 26px", boxShadow: HARD }}>
        <img key={recipe.id} src={recipe.img || `recipes/${recipe.id}.jpg`} alt={recipe.name}
          onError={e => { e.target.style.display = "none"; }}
          style={{ width: "calc(100% + 44px)", margin: "-22px -22px 16px", height: 200, objectFit: "cover", display: "block", borderBottom: RULE_THICK }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ background: CAT_COLORS[recipe.cat], border: RULE_THIN, padding: "2px 8px", ...label({ color: "#fff", fontSize: 10 }) }}>{recipe.cat}</span>
              <span style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>{GROUP_OF[recipe.diet] ? `plan ${GROUP_OF[recipe.diet].label}, dz. ${recipe.day}` : "przepis własny"}{recipe.time ? ` · ok. ${recipe.time} min` : ""}</span>
            </div>
            <h2 style={{ fontFamily: SANS, fontSize: 25, fontWeight: 800, margin: "8px 0 12px", color: INK, lineHeight: 1.1, letterSpacing: -0.6 }}>{recipe.name}</h2>
          </div>
          <button onClick={onClose} className="b" style={closeBtn}>×</button>
        </div>
        <MacroChips r={recipe} />
        {recipe.port > 1 && (
          <div style={{ marginTop: 14, background: "#F0A202", border: RULE, padding: "8px 11px", fontSize: 12.5, color: INK, fontWeight: 600, fontFamily: SANS }}>
            Przepis na {recipe.port} porcje — składniki dotyczą całego przepisu. Lista zakupów przelicza je na 1 porcję.
          </div>
        )}
        {recipe.note && (
          <div style={{ marginTop: 10, background: RED, border: RULE, padding: "8px 11px", fontSize: 12.5, color: "#fff", fontWeight: 600, fontFamily: SANS }}>{recipe.note}</div>
        )}
        <h3 style={{ ...label(), fontSize: 12, margin: "22px 0 0", borderBottom: RULE_THICK, paddingBottom: 5 }}>Składniki</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {recipe.ing.map((i, idx) => (
            <li key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${INK}22`, fontSize: 13.5, fontFamily: SANS }}>
              <span style={{ color: INK }}>{i.n}</span>
              <span style={{ color: MUTED, textAlign: "right", flexShrink: 0, fontFamily: MONO, fontSize: 12 }}>{i.d}</span>
            </li>
          ))}
        </ul>
        {steps.length > 0 && (
          <>
            <h3 style={{ ...label(), fontSize: 12, margin: "24px 0 0", borderBottom: RULE_THICK, paddingBottom: 5 }}>Przygotowanie</h3>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {steps.map((s, idx) => (
                <li key={idx} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "10px 0", borderBottom: idx < steps.length-1 ? `1px solid ${INK}22` : "none" }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, background: INK, color: CREAM, fontSize: 11.5, fontWeight: 700, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx+1}</span>
                  <span style={{ fontSize: 13.5, color: INK, lineHeight: 1.5, fontFamily: SANS }}>{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

const pendingKey = userId => `pending-sync-${userId}`;

function readPending(userId) {
  try { return JSON.parse(localStorage.getItem(pendingKey(userId))) || {}; }
  catch { return {}; }
}

// Anything that changes the unsaved-work set notifies the header indicator.
const syncListeners = new Set();
function subscribeSync(fn) { syncListeners.add(fn); return () => syncListeners.delete(fn); }

function writePending(userId, next) {
  try {
    if (Object.keys(next).length) localStorage.setItem(pendingKey(userId), JSON.stringify(next));
    else localStorage.removeItem(pendingKey(userId));
  } catch (e) {
    console.error(e); // private mode / quota - the in-memory queue still retries
  }
  syncListeners.forEach(fn => fn());
}

function stashPending(userId, column, value) {
  writePending(userId, { ...readPending(userId), [column]: value });
}

function clearPendingColumn(userId, column) {
  const rest = readPending(userId);
  delete rest[column];
  writePending(userId, rest);
}

function hasPending(userId) { return Object.keys(readPending(userId)).length > 0; }

function flushPending(userId) {
  const pending = readPending(userId);
  for (const column of Object.keys(pending)) syncColumn(userId, column, pending[column]);
}

// Column writes are whole-value overwrites (not diffs), so every request has to carry exactly
// the value the server should end up with:
//   * The value is stashed in localStorage first and only cleared once the server confirms it,
//     so a failed request, a crash or a closed tab never drops an edit.
//   * Requests for the same user+column are sent one at a time, never concurrently: a write
//     arriving mid-flight replaces whatever is queued and goes out when the in-flight request
//     resolves. Responses therefore stay in send order (a slow request can't land after a newer
//     one and clobber fresher data) and bursts of changes (e.g. "Wylosuj dzień") coalesce into
//     one trailing request instead of one request per change.
//   * A failed request is retried with exponential backoff (capped at RETRY_MAX) while holding
//     its queue slot, so later edits fold into the retry instead of racing it. A fresh edit or
//     an "online" event cancels the backoff and retries immediately.
// Writes use upsert, not update: `update ... .eq("user_id", ...)` that matches no row resolves
// with error === null, so a missing plans row (first-login insert failed, row deleted) used to
// look like a successful save while nothing was stored.
const RETRY_MAX = 30000;
const inFlight = new Map(); // `${userId}:${column}` -> { queued, retry, attempt }

function syncColumn(userId, column, value) {
  stashPending(userId, column, value);

  const key = `${userId}:${column}`;
  const state = inFlight.get(key);
  if (state) {
    state.queued = value;
    if (state.retry) { // a new edit is a good moment to retry a failed write
      clearTimeout(state.retry);
      state.retry = null;
      state.attempt = 0;
      sendQueued(userId, column);
    }
    return;
  }

  inFlight.set(key, { queued: undefined, retry: null, attempt: 0 });
  sendColumn(userId, column, value);
}

function sendQueued(userId, column) {
  const state = inFlight.get(`${userId}:${column}`);
  if (!state || state.queued === undefined) return;
  const value = state.queued;
  state.queued = undefined;
  sendColumn(userId, column, value);
}

function sendColumn(userId, column, value) {
  const key = `${userId}:${column}`;
  supabase.from("plans")
    .upsert({ user_id: userId, [column]: value, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .then(({ error }) => {
      const state = inFlight.get(key);
      if (!state) return;
      if (error) {
        console.error(error);
        if (state.queued === undefined) state.queued = value; // keep it queued, never drop it
        state.retry = setTimeout(() => { state.retry = null; sendQueued(userId, column); },
          Math.min(RETRY_MAX, 1000 * 2 ** state.attempt));
        state.attempt += 1;
        syncListeners.forEach(fn => fn());
        return;
      }
      state.attempt = 0;
      if (state.queued !== undefined) { sendQueued(userId, column); return; }
      inFlight.delete(key);
      clearPendingColumn(userId, column);
    });
}

export default function App({ session }) {
  const user = session.user;
  const today = new Date();
  const [tab, setTab] = useState("cal");
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(keyOf(today));
  const [plan, setPlan] = useState({});
  const [loadState, setLoadState] = useState("loading"); // "loading" | "ready" | "error"
  const loaded = loadState === "ready";
  const [modal, setModal] = useState(null);
  const [picker, setPicker] = useState(null);
  const [from, setFrom] = useState(keyOf(today));
  const [to, setTo] = useState(keyOf(new Date(today.getTime() + 2*86400000)));
  const [shopChecked, setShopChecked] = useState(() => readShopChecked(user.id));

  const [eaten, setEaten] = useState({});
  const [goals, setGoals] = useState(DEFAULT_GOALS);

  const alive = useRef(true);
  const stateRef = useRef({ plan, eaten, goals });
  useEffect(() => { stateRef.current = { plan, eaten, goals }; });

  // What the server is known to hold, recorded whenever a load succeeds. The sync effects below
  // compare against it so the state change caused by the load itself doesn't count as an edit -
  // without that, every app open pushed all three columns straight back up.
  const baseline = useRef({ plan, eaten, goals });

  const loadPlan = useCallback(async () => {
    const { data, error } = await supabase
      .from("plans")
      .select("plan, eaten, goals")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!alive.current) return;

    // Anything left unsent from an earlier session wins over the server copy: it was made on top
    // of a fully loaded plan and hasn't been stored yet.
    const pending = readPending(user.id);
    const cur = stateRef.current;
    const next = {
      plan: pending.plan ?? (data && data.plan) ?? cur.plan,
      eaten: pending.eaten ?? (data && data.eaten) ?? cur.eaten,
      goals: { ...DEFAULT_GOALS, ...((data && data.goals) || {}), ...(pending.goals || {}) },
    };
    baseline.current = next;
    setPlan(next.plan);
    setEaten(next.eaten);
    setGoals(next.goals);

    if (error) { console.error(error); setLoadState("error"); return; }

    if (!data) { // first login: create the row (ignoreDuplicates keeps StrictMode's double run quiet)
      const { error: insertError } = await supabase.from("plans")
        .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
      if (!alive.current) return;
      if (insertError) { console.error(insertError); setLoadState("error"); return; }
    }

    setLoadState("ready");
    flushPending(user.id);
  }, [user.id]);

  useEffect(() => {
    alive.current = true;
    loadPlan();
    return () => { alive.current = false; };
  }, [loadPlan]);

  // A failed load leaves us not knowing what the server holds, so the app refuses to render the
  // planner (see the error card below) rather than let edits pile up on top of this session's
  // empty defaults and overwrite the stored plan. Keep retrying until one succeeds.
  useEffect(() => {
    if (loadState !== "error") return;
    const id = setInterval(loadPlan, 15000);
    return () => clearInterval(id);
  }, [loadState, loadPlan]);

  useEffect(() => {
    const onOnline = () => { if (loadState === "error") loadPlan(); else if (loaded) flushPending(user.id); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadState, loaded, loadPlan, user.id]);

  const [unsaved, setUnsaved] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => { setUnsaved(hasPending(user.id)); setOnline(navigator.onLine); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const unsubscribe = subscribeSync(update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      unsubscribe();
    };
  }, [user.id]);

  const syncCol = (column, value) => {
    if (!loaded || value === baseline.current[column]) return;
    syncColumn(user.id, column, value);
  };

  useEffect(() => { syncCol("goals", goals); }, [goals, loaded, user.id]);

  // Locks background scroll while a modal is open. Without this, focusing the search
  // input on iOS scrolls the underlying page along with the "fixed" overlay (a WebKit
  // quirk), which reveals the app header above the modal. Escape closes the topmost one -
  // handled here rather than per component so the recipe preview opened on top of the picker
  // closes first instead of both closing at once.
  useEffect(() => {
    const isOpen = !!(picker || modal);
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (!isOpen) return () => { document.body.style.overflow = ""; };
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null); else setPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [picker, modal]);

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

  useEffect(() => { syncCol("plan", plan); }, [plan, loaded, user.id]);

  useEffect(() => { syncCol("eaten", eaten); }, [eaten, loaded, user.id]);

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
    const current = CATS.map(c => (plan[selected] || {})[c]).join(",");
    let pick = null;
    for (let attempt = 0; attempt < 4; attempt++) { // re-draw if we land on the day already shown
      pick = drawDay(goal);
      if (pick.map(r => r.id).join(",") !== current) break;
    }
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

  // Ticks belong to one date range: change the range and the list starts unticked again.
  const shopRange = rangeOf(from, to);
  const checked = shopChecked.range === shopRange ? shopChecked.items : NO_TICKS;
  const toggleChecked = key => setShopChecked(s => {
    const items = { ...(s.range === shopRange ? s.items : NO_TICKS) };
    if (items[key]) delete items[key]; else items[key] = true;
    return { range: shopRange, items };
  });
  useEffect(() => {
    try {
      if (Object.keys(shopChecked.items).length) localStorage.setItem(shopKey(user.id), JSON.stringify(shopChecked));
      else localStorage.removeItem(shopKey(user.id));
    } catch (e) { console.error(e); }
  }, [shopChecked, user.id]);

  const sel = plan[selected] || {};
  const totals = dayTotals(selected);

  const card = { background: PAPER, border: RULE_THICK, boxShadow: HARD, padding: 16 };
  const selectStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: RULE, background: PAPER, fontSize: 13, color: INK, fontFamily: MONO };

  return (
    <div style={{ minHeight: "100dvh", background: CREAM, fontFamily: SANS, color: INK }}>
      <style>{`
        button { font-family: inherit; border-radius: 0; }
        input, select { border-radius: 0; }
        select:focus, input:focus, button:focus-visible { outline: 3px solid ${RED}; outline-offset: 2px; }
        .b { transition: transform .07s ease, box-shadow .07s ease; }
        .b:active { transform: translate(3px, 3px); box-shadow: none !important; }
        @media (max-width: 760px) {
          main > div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <header style={{ background: INK, color: CREAM, padding: "calc(16px + env(safe-area-inset-top)) 16px 0", borderBottom: RULE_THICK }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: SANS, fontSize: 27, fontWeight: 800, margin: 0, letterSpacing: -0.8, textTransform: "uppercase" }}>Planer diety</h1>
              <span style={{ fontSize: 11, color: "#A8A092", fontFamily: MONO }}>{RECIPES.length} przepisów · cel {goals.global} kcal</span>
              {unsaved && (
                <span title="Zmiany są zapisane w tej przeglądarce i zostaną wysłane na serwer, gdy tylko się uda."
                  style={{ background: "#F0A202", color: INK, border: `2px solid ${CREAM}`, padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: SANS }}>
                  {online ? "Zapisywanie…" : "Offline — zapiszę później"}
                </span>
              )}
            </div>
            <button onClick={() => supabase.auth.signOut()} title={user.email} style={{
              border: `2px solid ${CREAM}`, background: "none", color: CREAM,
              padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              textTransform: "uppercase", letterSpacing: 0.8
            }}>Wyloguj</button>
          </div>
          <nav style={{ display: "flex", gap: 6, marginTop: 14 }}>
            {[["cal","Kalendarz"],["shop","Lista zakupów"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                border: `2px solid ${CREAM}`, borderBottom: tab === id ? `2px solid ${PAPER}` : `2px solid ${CREAM}`,
                cursor: "pointer", padding: "9px 16px", fontSize: 12, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: -3,
                background: tab === id ? PAPER : "transparent",
                color: tab === id ? INK : CREAM
              }}>{lbl}</button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "22px 16px calc(60px + env(safe-area-inset-bottom))" }}>
        {loadState === "loading" && <div style={{ color: MUTED, fontSize: 13, fontFamily: MONO }}>Wczytywanie planu…</div>}

        {loadState === "error" && (
          <section style={{ ...card, maxWidth: 560, margin: "0 auto" }}>
            <h2 style={{ fontFamily: SANS, fontSize: 21, fontWeight: 800, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: -0.5 }}>Nie udało się wczytać planu</h2>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 16px", fontFamily: SANS }}>
              Twój plan jest bezpieczny — po prostu nie mamy do niego teraz dostępu. Edycja jest wyłączona,
              żeby przypadkiem nie nadpisać go pustym planem. {unsaved && "Niewysłane zmiany czekają w tej przeglądarce. "}
              Próbujemy ponownie automatycznie co 15 sekund.
            </p>
            <button onClick={() => { setLoadState("loading"); loadPlan(); }} className="b" style={{
              background: RED, color: "#fff", border: RULE, boxShadow: HARD_SM, padding: "11px 18px",
              fontWeight: 700, fontSize: 12.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.8
            }}>Spróbuj ponownie</button>
          </section>
        )}

        {tab === "cal" && loaded && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1.15fr) minmax(300px, 1fr)", gap: 20, alignItems: "start" }}>
            {/* DAY PANEL */}
            <section style={card}>
              <h2 style={{ fontFamily: SANS, fontSize: 23, fontWeight: 800, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: -0.6, lineHeight: 1.05 }}>{fmtPL(selected)}</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ ...label(), color: MUTED, marginRight: 3 }}>Cel</span>
                {TARGETS.map(t => {
                  const active = targetFor(selected) === t;
                  return (
                    <button key={t} onClick={() => setDayGoal(t)} style={{
                      border: RULE, background: active ? RED : PAPER, color: active ? "#fff" : INK,
                      padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: MONO
                    }}>{t}</button>
                  );
                })}
                {goals.days[selected] && goals.days[selected] !== goals.global && (
                  <button onClick={makeGlobalGoal} title="Użyj tego celu dla wszystkich dni bez własnego celu"
                    style={{ border: "none", background: "none", color: RED, fontSize: 10.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    domyślny
                  </button>
                )}
              </div>

              {totals
                ? (() => {
                    const goal = targetFor(selected);
                    const diff = totals.kcal - goal;
                    const onTrack = Math.abs(diff) <= 50;
                    const barColor = onTrack ? "#0F8B5F" : diff > 0 ? RED : "#F0A202";
                    const eDay = eaten[selected] || {};
                    let eKcal = 0, eN = 0;
                    CATS.forEach(cat => { const r = byId[sel[cat]]; if (r && eDay[cat]) { eKcal += r.kcal; eN++; } });
                    return (
                      <div style={{ marginBottom: 16, border: RULE, background: CREAM, padding: "10px 11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontFamily: MONO, fontSize: 13 }}>
                          <b style={{ fontSize: 15 }}>{totals.kcal} / {goal} kcal</b>
                          <b style={{ color: barColor, fontSize: 14 }}>{diff >= 0 ? "+" : "−"}{Math.abs(diff)}</b>
                        </div>
                        <div style={{ height: 12, background: PAPER, border: RULE_THIN, margin: "8px 0 7px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, totals.kcal / goal * 100)}%`, height: "100%", background: barColor }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontFamily: MONO, color: MUTED }}>
                          <span>B {totals.p} · T {totals.f} · W {totals.c}</span>
                          <span style={{ color: eN ? INK : MUTED, fontWeight: eN ? 700 : 400 }}>zjedzone {eN}/{totals.n} · {eKcal} kcal</span>
                        </div>
                      </div>
                    );
                  })()
                : <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 16, border: `2px dashed ${INK}55`, padding: "12px 11px", fontFamily: SANS }}>Brak zaplanowanych posiłków — wybierz je poniżej lub wylosuj pod cel dnia.</div>}

              {CATS.map(cat => {
                const r = byId[sel[cat]];
                const isEaten = !!(eaten[selected] || {})[cat];
                return (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 8 }}>
                      <span style={{ background: CAT_COLORS[cat], border: RULE_THIN, padding: "2px 8px", ...label({ color: "#fff", fontSize: 10 }) }}>{cat}</span>
                      {r && (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => setModal(r)} style={{ border: "none", background: "none", color: INK, fontSize: 10.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>przepis</button>
                          <button onClick={() => toggleEaten(selected, cat)} title={isEaten ? "Cofnij oznaczenie" : "Oznacz jako zjedzone"} style={{
                            border: RULE_THIN, background: isEaten ? INK : PAPER, color: isEaten ? CREAM : MUTED,
                            padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                            textTransform: "uppercase", letterSpacing: 0.5
                          }}>{isEaten ? "✓ zjedzone" : "zjedzone?"}</button>
                        </span>
                      )}
                    </div>
                    <button onClick={() => setPicker(cat)} className="b" style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 11, textAlign: "left",
                      padding: r ? "8px 9px" : "16px 12px", cursor: "pointer",
                      border: RULE, boxShadow: isEaten ? "none" : HARD_SM,
                      background: isEaten ? CREAM : PAPER, opacity: isEaten ? 0.7 : 1
                    }}>
                      {r ? (
                        <>
                          <RecipeThumb key={r.id} r={r} size={46} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.25, fontFamily: SANS }}>{r.name}</div>
                            <div style={{ marginTop: 5 }}><MacroChips r={r} size="sm" /></div>
                          </div>
                          <span style={{ color: INK, fontSize: 17, flexShrink: 0, fontWeight: 700 }}>→</span>
                        </>
                      ) : (
                        <span style={{ color: MUTED, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>+ Wybierz posiłek</span>
                      )}
                    </button>
                  </div>
                );
              })}

              <div style={{ marginTop: 18, borderTop: RULE_THICK, paddingTop: 14 }}>
                <button onClick={fillDay} className="b" style={{ background: RED, color: "#fff", border: RULE, boxShadow: HARD_SM, padding: "12px 18px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.8, width: "100%" }}>
                  Wylosuj dzień pod {targetFor(selected)} kcal
                </button>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8, fontFamily: MONO, lineHeight: 1.5 }}>Losuje 4 posiłki tak, aby suma trafiła w cel (±50 kcal). Kliknij ponownie, jeśli zestaw nie pasuje.</div>
              </div>
            </section>

            {/* CALENDAR */}
            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <button onClick={() => setView(v => ({ y: v.m === 0 ? v.y-1 : v.y, m: (v.m+11)%12 }))} style={{ border: RULE, background: PAPER, width: 32, height: 32, cursor: "pointer", fontSize: 15, fontWeight: 700 }}>←</button>
                <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.3 }}>{MONTHS[view.m]} {view.y}</div>
                <button onClick={() => setView(v => ({ y: v.m === 11 ? v.y+1 : v.y, m: (v.m+1)%12 }))} style={{ border: RULE, background: PAPER, width: 32, height: 32, cursor: "pointer", fontSize: 15, fontWeight: 700 }}>→</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
                {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: MUTED, padding: "3px 0", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: MONO }}>{d}</div>)}
                {weeks.flat().map((dt, i) => {
                  const k = keyOf(dt);
                  const inMonth = dt.getMonth() === view.m;
                  const isSel = k === selected;
                  const isToday = k === keyOf(today);
                  const t = dayTotals(k);
                  const day = plan[k] || {};
                  return (
                    <button key={i} onClick={() => setSelected(k)} style={{
                      border: isSel ? `2px solid ${INK}` : isToday ? `2px solid ${RED}` : `1.5px solid ${INK}33`,
                      background: isSel ? INK : inMonth ? PAPER : "transparent",
                      color: isSel ? CREAM : INK,
                      opacity: inMonth ? 1 : 0.4, padding: "5px 3px 4px",
                      minHeight: 54, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: isToday || isSel ? 700 : 500, fontFamily: MONO }}>{dt.getDate()}</span>
                      <span style={{ display: "flex", gap: 2 }}>
                        {CATS.map(c => byId[day[c]] ? <span key={c} style={{ width: 5, height: 5, background: CAT_COLORS[c] }} /> : null)}
                      </span>
                      {t && <span style={{ fontSize: 9, color: isSel ? CREAM : MUTED, fontWeight: 700, fontFamily: MONO }}>{t.kcal}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", borderTop: RULE, paddingTop: 10 }}>
                {CATS.map(c => (
                  <span key={c} style={{ fontSize: 10, color: INK, display: "flex", alignItems: "center", gap: 5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <span style={{ width: 9, height: 9, background: CAT_COLORS[c], border: `1px solid ${INK}` }} />{c}
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "shop" && loaded && (
          <section style={{ ...card, maxWidth: 640, margin: "0 auto", padding: 18 }}>
            <h2 style={{ fontFamily: SANS, fontSize: 23, fontWeight: 800, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: -0.6 }}>Lista zakupów</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ ...label(), color: MUTED, display: "block", marginBottom: 4 }}>Od</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selectStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ ...label(), color: MUTED, display: "block", marginBottom: 4 }}>Do</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selectStyle} />
              </div>
            </div>

            {shopping && shopping.total > 0 ? (
              <>
                <div style={{ background: INK, color: CREAM, padding: "10px 12px", fontSize: 12, marginBottom: 16, fontFamily: MONO }}>
                  <b>{shopping.days}</b> dni · <b>{shopping.meals}</b> posiłków · <b>{shopping.kcal}</b> kcal
                  <div style={{ fontSize: 10, color: "#A8A092", marginTop: 3 }}>Ilości przeliczone na 1 porcję i zsumowane.</div>
                </div>
                {shopping.groups.map(group => {
                  const doneIn = group.items.filter(i => checked[i.key]).length;
                  return (
                    <div key={group.cat} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: CREAM, border: RULE, padding: "6px 10px" }}>
                        <span style={{ ...label(), fontSize: 11 }}>{group.cat}</span>
                        <span style={{ fontSize: 11, color: MUTED, fontWeight: 700, fontFamily: MONO }}>{doneIn}/{group.items.length}</span>
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {group.items.map(item => {
                          const done = checked[item.key];
                          return (
                            <li key={item.key}>
                              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderBottom: `1px solid ${INK}22`, cursor: "pointer", opacity: done ? 0.4 : 1 }}>
                                <input type="checkbox" checked={!!done} onChange={() => toggleChecked(item.key)} style={{ width: 17, height: 17, accentColor: RED, flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, textDecoration: done ? "line-through" : "none" }}>{item.name}</span>
                                <span style={{ fontWeight: 700, fontSize: 12, color: INK, fontFamily: MONO }}>{fmtG(item.g)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontFamily: MONO }}>Odhaczone: {Object.values(checked).filter(Boolean).length} / {shopping.total}</div>
              </>
            ) : (
              <div style={{ color: MUTED, fontSize: 13, padding: "24px 0", textAlign: "center", fontFamily: SANS }}>
                Brak posiłków w wybranym zakresie dat.<br />Zaplanuj dietę w zakładce Kalendarz.
              </div>
            )}
          </section>
        )}
      </main>

      {picker && (
        <PickerModal cat={picker} currentId={(plan[selected] || {})[picker]}
          ctx={(() => {
            const day = plan[selected] || {};
            let others = 0, filled = 0;
            CATS.forEach(c => { if (c !== picker) { const r = byId[day[c]]; if (r) { others += r.kcal; filled++; } } });
            const goal = targetFor(selected);
            return { others, filled, goal, remaining: goal - others };
          })()}
          onPick={id => { setMeal(selected, picker, id); setPicker(null); }}
          onPreview={r => setModal(r)}
          onClose={() => setPicker(null)} />
      )}
      {modal && <RecipeModal recipe={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
