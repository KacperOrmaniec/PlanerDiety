import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { RECIPES } from "./data/recipes.js";
import { STEPS } from "./data/instructions.js";
import { ING_CAT } from "./data/categories.js";
import { supabase } from "./lib/supabaseClient.js";

import {
  FONT, GREEN, GREEN_DEEP, GREEN_SOFT, GREEN_GLOW, BG, CARD, INK, INK_SOFT, MUTED, LINE, FILL,
  AMBER, AMBER_SOFT, AMBER_DEEP, RED, RED_SOFT, RED_DEEP, R_CARD, R_CTRL, R_PILL, SHADOW_SM, NUM,
  MONTHS, DOW, keyOf, fmtPL, dowOf, plural,
  caption, sectionLabel, cardStyle, listBox, iconBtn, pillBtn, primaryBtn, fieldStyle, overlay, sheet, Segmented,
  SwipeRow, UndoToast,
  fmtNum, parseNum,
  P_CHEVRON, P_BACK, P_CLOSE, P_CHECK, P_PLUS, P_SEARCH, P_EDIT, P_TRASH, Icon,
} from "./ui.jsx";
import Progress from "./Progress.jsx";

const CATS = ["Śniadanie", "Obiad", "Kolacja", "Przekąska"];
// Category colours deliberately avoid green, so a coloured dot never reads as "on target".
const CAT_COLORS = { "Śniadanie": "#FF9F0A", "Obiad": "#30B0C7", "Kolacja": "#5E5CE6", "Przekąska": "#FF375F" };
const CAT_TINT = {
  "Śniadanie": { bg: "#FFF3E0", fg: "#A05C00" },
  "Obiad": { bg: "#E4F5F9", fg: "#0B6E86" },
  "Kolacja": { bg: "#EDECFE", fg: "#4340C0" },
  "Przekąska": { bg: "#FFE8EE", fg: "#C4103C" },
};
const CAT_MARK = { "Śniadanie": "Ś", "Obiad": "O", "Kolacja": "K", "Przekąska": "P" };
const MACROS = [
  { key: "p", mark: "B", fg: "#4340C0", bg: "#EDECFE" },
  { key: "f", mark: "T", fg: "#A05C00", bg: "#FFF3E0" },
  { key: "c", mark: "W", fg: "#0B6E86", bg: "#E4F5F9" },
];

const byId = {};
RECIPES.forEach(r => { byId[r.id] = r; });

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

function MacroChips({ r, size }) {
  const s = size === "sm";
  const padding = s ? "2px 8px" : "4px 10px";
  const fs = s ? 11 : 12.5;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ background: INK, color: "#fff", borderRadius: R_PILL, padding, fontSize: fs, fontWeight: 600, whiteSpace: "nowrap", ...NUM }}>
        {r.kcal} kcal
      </span>
      {MACROS.map(m => (
        <span key={m.mark} style={{ background: m.bg, color: m.fg, borderRadius: R_PILL, padding, fontSize: fs, fontWeight: 600, whiteSpace: "nowrap", ...NUM }}>
          {m.mark} {r[m.key]}
        </span>
      ))}
    </div>
  );
}

function RecipeThumb({ r, size, radius = 12 }) {
  const [err, setErr] = useState(false);
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0, display: "block" };
  if (err) return (
    <div style={{ ...box, background: CAT_TINT[r.cat].bg, color: CAT_TINT[r.cat].fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.4), fontWeight: 700 }}>{CAT_MARK[r.cat]}</div>
  );
  return <img src={r.img || `recipes/${r.id}.jpg`} alt="" loading="lazy" onError={() => setErr(true)}
    style={{ ...box, objectFit: "cover", background: FILL, boxShadow: `inset 0 0 0 1px ${LINE}` }} />;
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

// A drawn day is always four meals, so its total can never leave this span.
const MIN_DAY = SUMS[0].min;
const MAX_DAY = SUMS[0].min + SUMS[0].counts.length - 1;

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

// Rendered only while open (and therefore remounted on every open), so the search box and plan
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

  return (
    <div onClick={onClose} style={overlay(40)}>
      <div onClick={e => e.stopPropagation()} style={{ ...sheet, maxWidth: 560, maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 10, height: 10, borderRadius: R_PILL, background: CAT_COLORS[cat] }} />
              {cat}
            </h2>
            <button onClick={onClose} className="press" aria-label="Zamknij" style={iconBtn}>
              <Icon d={P_CLOSE} size={15} color={INK_SOFT} stroke={2.2} />
            </button>
          </div>

          {ctx && ctx.filled > 0 && (
            <div style={{ marginTop: 12, background: GREEN_SOFT, borderRadius: R_CTRL, padding: "10px 12px", fontSize: 13, color: INK_SOFT, ...NUM }}>
              Reszta dnia <b style={{ color: INK, fontWeight: 600 }}>{ctx.others}</b> · cel <b style={{ color: INK, fontWeight: 600 }}>{ctx.goal}</b> · zostaje{" "}
              <b style={{ color: GREEN_DEEP, fontWeight: 700 }}>~{ctx.remaining} kcal</b>
            </div>
          )}

          <div style={{ position: "relative", marginTop: 12 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
              <Icon d={P_SEARCH} size={16} color={MUTED} />
            </span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj po nazwie…" autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px 11px 38px", borderRadius: R_CTRL,
                border: `1px solid ${LINE}`, background: FILL, fontSize: 14.5, fontWeight: 500, color: INK }} />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={caption({ marginRight: 2 })}>Plan</span>
            <button onClick={() => setGroup(null)} className="press" style={pillBtn(!group)}>Wszystkie</button>
            {DIET_GROUPS.map(g => (
              <button key={g.label} onClick={() => setGroup(g === group ? null : g)} className="press" style={pillBtn(g === group)}>{g.label}</button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "0 12px 16px" }}>
          {currentId && (
            <button onClick={() => onPick(null)} className="press" style={{
              width: "100%", border: `1px solid ${LINE}`, background: CARD, borderRadius: R_CTRL,
              padding: "11px 12px", fontSize: 13.5, color: RED_DEEP, fontWeight: 600, cursor: "pointer", margin: "14px 0 2px"
            }}>Usuń posiłek z tego dnia</button>
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div style={{ position: "sticky", top: 0, zIndex: 1, background: CARD, ...sectionLabel(), padding: "16px 4px 8px" }}>{g.label}</div>
              {g.items.map(r => {
                const isSel = r.id === currentId;
                const fits = ctx && ctx.filled === CATS.length - 1 && Math.abs(r.kcal - ctx.remaining) <= 60;
                return (
                  <div key={r.id} onClick={() => onPick(r.id)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.id); } }}
                    className="row press"
                    style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px", cursor: "pointer",
                      borderRadius: R_CTRL, background: isSel ? GREEN_SOFT : "transparent", marginTop: 2 }}>
                    <RecipeThumb key={r.id} r={r} size={54} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="clamp2" style={{ fontSize: 14.5, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{r.name}</div>
                      <div className="ellip" style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.45, ...NUM }}>
                        <b style={{ color: INK_SOFT, fontWeight: 600 }}>{r.kcal} kcal</b> · B {r.p} · T {r.f} · W {r.c}{group ? "" : GROUP_OF[r.diet] ? ` · plan ${GROUP_OF[r.diet].kcal}` : " · własny"}{r.time ? ` · ${r.time} min` : ""}
                      </div>
                    </div>
                    {fits && (
                      <span style={{ background: GREEN_SOFT, color: GREEN_DEEP, borderRadius: R_PILL, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>Pasuje</span>
                    )}
                    {isSel && <Icon d={P_CHECK} size={17} color={GREEN_DEEP} stroke={2.4} />}
                    <button onClick={e => { e.stopPropagation(); onPreview(r); }} title="Zobacz przepis" className="press"
                      style={{ border: `1px solid ${LINE}`, background: CARD, borderRadius: R_PILL, padding: "6px 12px",
                        fontSize: 12, fontWeight: 600, color: INK_SOFT, cursor: "pointer", flexShrink: 0 }}>
                      Przepis
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {!groups.length && <div style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "36px 0" }}>Brak przepisów dla tych filtrów.</div>}
        </div>
      </div>
    </div>
  );
}

function RecipeModal({ recipe, onClose }) {
  const [imgErr, setImgErr] = useState(false);
  const steps = (STEPS[recipe.id] || "")
    .split("\n")
    .map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  const tint = CAT_TINT[recipe.cat];
  const heroRadius = `${R_CARD}px ${R_CARD}px 0 0`;
  return (
    <div onClick={onClose} style={overlay(50)}>
      <div onClick={e => e.stopPropagation()} style={{ ...sheet, maxWidth: 580, maxHeight: "88dvh", overflowY: "auto" }}>
        <div style={{ position: "relative" }}>
          {imgErr ? (
            <div style={{ height: 200, borderRadius: heroRadius, background: tint.bg, color: tint.fg,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 700 }}>
              {CAT_MARK[recipe.cat]}
            </div>
          ) : (
            <img src={recipe.img || `recipes/${recipe.id}.jpg`} alt={recipe.name} onError={() => setImgErr(true)}
              style={{ width: "100%", height: 210, objectFit: "cover", display: "block", borderRadius: heroRadius, background: FILL }} />
          )}
          <button onClick={onClose} className="press" aria-label="Zamknij"
            style={{ ...iconBtn, position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.92)", boxShadow: SHADOW_SM }}>
            <Icon d={P_CLOSE} size={15} color={INK} stroke={2.2} />
          </button>
        </div>

        <div style={{ padding: "18px 22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: tint.bg, color: tint.fg, borderRadius: R_PILL, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>{recipe.cat}</span>
            <span style={{ fontSize: 12.5, color: MUTED, ...NUM }}>
              {GROUP_OF[recipe.diet] ? `plan ${GROUP_OF[recipe.diet].label}, dz. ${recipe.day}` : "przepis własny"}{recipe.time ? ` · ok. ${recipe.time} min` : ""}
            </span>
          </div>
          <h2 style={{ fontSize: 25, fontWeight: 700, margin: "10px 0 14px", color: INK, lineHeight: 1.15, letterSpacing: -0.7 }}>{recipe.name}</h2>
          <MacroChips r={recipe} />

          {recipe.port > 1 && (
            <div style={{ marginTop: 14, background: AMBER_SOFT, color: AMBER_DEEP, borderRadius: R_CTRL, padding: "11px 13px", fontSize: 13, fontWeight: 500, lineHeight: 1.55 }}>
              Przepis na {recipe.port} {plural(recipe.port, "porcję", "porcje", "porcji")} — składniki dotyczą całego przepisu. Lista zakupów przelicza je na 1 porcję.
            </div>
          )}
          {recipe.note && (
            <div style={{ marginTop: 10, background: RED_SOFT, color: RED_DEEP, borderRadius: R_CTRL, padding: "11px 13px", fontSize: 13, fontWeight: 500, lineHeight: 1.55 }}>{recipe.note}</div>
          )}

          <h3 style={{ ...sectionLabel(), margin: "24px 0 8px" }}>Składniki</h3>
          <ul style={{ ...listBox, listStyle: "none", padding: 0, margin: 0 }}>
            {recipe.ing.map((i, idx) => (
              <li key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 14px",
                borderTop: idx ? `1px solid ${LINE}` : "none", fontSize: 14, color: INK }}>
                <span>{i.n}</span>
                <span style={{ color: MUTED, textAlign: "right", flexShrink: 0, fontSize: 13, ...NUM }}>{i.d}</span>
              </li>
            ))}
          </ul>

          {steps.length > 0 && (
            <>
              <h3 style={{ ...sectionLabel(), margin: "26px 0 6px" }}>Przygotowanie</h3>
              <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {steps.map((s, idx) => (
                  <li key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0" }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: R_PILL, background: GREEN_SOFT,
                      color: GREEN_DEEP, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", ...NUM }}>{idx + 1}</span>
                    <span style={{ fontSize: 14, color: INK_SOFT, lineHeight: 1.6 }}>{s}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A "szybki wpis": food eaten outside the plan, logged straight into a day. It is deliberately
// NOT a recipe - RECIPES is a build artifact generated from the spreadsheet, and an ad-hoc entry
// has no business in it. Each entry carries its own numbers, so nothing here references the
// catalogue and nothing here can be searched for or reused from the picker.
const QUICK_MAX_KCAL = 5000;

function quickTotals(list) {
  return (list || []).reduce((t, e) => ({
    kcal: t.kcal + (e.kcal || 0), p: t.p + (e.p || 0), f: t.f + (e.f || 0), c: t.c + (e.c || 0), n: t.n + 1,
  }), { kcal: 0, p: 0, f: 0, c: 0, n: 0 });
}

function QuickEntryModal({ entry, dayLabel, onSave, onDelete, onClose }) {
  const isNew = !entry.id;
  const [name, setName] = useState(entry.name || "");
  const [kcal, setKcal] = useState(entry.kcal === undefined || entry.kcal === null ? "" : fmtNum(entry.kcal));
  const [p, setP] = useState(entry.p === undefined || entry.p === null ? "" : fmtNum(entry.p));
  const [c, setC] = useState(entry.c === undefined || entry.c === null ? "" : fmtNum(entry.c));
  const [f, setF] = useState(entry.f === undefined || entry.f === null ? "" : fmtNum(entry.f));
  const [cat, setCat] = useState(entry.cat || "");
  const [macros, setMacros] = useState([entry.p, entry.c, entry.f].some(v => v !== undefined && v !== null));
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = e => {
    e.preventDefault();
    const kc = parseNum(kcal);
    if (kc === null || Number.isNaN(kc)) { setError("Podaj kalorie — to jedyne wymagane pole."); return; }
    if (kc <= 0 || kc > QUICK_MAX_KCAL) { setError(`Kalorie poza sensownym zakresem (0–${QUICK_MAX_KCAL} kcal).`); return; }

    const macro = {};
    for (const [key, raw, label] of [["p", p, "Białko"], ["c", c, "Węglowodany"], ["f", f, "Tłuszcze"]]) {
      const n = parseNum(raw);
      if (Number.isNaN(n)) { setError(`Nieprawidłowa liczba w polu „${label}”.`); return; }
      if (n !== null && (n < 0 || n > 1000)) { setError(`„${label}” poza sensownym zakresem.`); return; }
      macro[key] = n;
    }

    onSave({
      id: entry.id || crypto.randomUUID(),
      name: name.trim() || "Szybki wpis",
      kcal: Math.round(kc),
      ...macro,
      cat: cat || null,
    });
  };

  const numField = (label, value, setValue, autoFocus) => (
    <div style={{ flex: "1 1 30%", minWidth: 90 }}>
      <label style={{ ...caption(), display: "block", marginBottom: 6 }}>{label} <span style={{ color: MUTED }}>(g)</span></label>
      <input inputMode="decimal" value={value} placeholder="—" autoFocus={autoFocus}
        onChange={e => setValue(e.target.value)} style={fieldStyle} />
    </div>
  );

  return (
    <div onClick={onClose} style={overlay(45)}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ ...sheet, maxWidth: 460, maxHeight: "90dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>{isNew ? "Szybki wpis" : "Edytuj wpis"}</h2>
            <div style={{ ...caption({ fontSize: 12.5, marginTop: 3 }), ...NUM }}>{dayLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="press" aria-label="Zamknij" style={iconBtn}>
            <Icon d={P_CLOSE} size={15} color={INK_SOFT} stroke={2.2} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 18px 20px" }}>
          <label style={{ ...caption(), display: "block", marginBottom: 6 }}>Nazwa</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="np. pizza u Marka" style={{ ...fieldStyle, fontVariantNumeric: "normal" }} />

          <label style={{ ...caption(), display: "block", margin: "14px 0 6px" }}>Kalorie <span style={{ color: MUTED }}>(kcal)</span></label>
          <input inputMode="decimal" value={kcal} onChange={e => setKcal(e.target.value)} placeholder="—" style={fieldStyle} />

          <button type="button" onClick={() => setMacros(m => !m)} className="press"
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer",
              color: INK_SOFT, fontSize: 13, fontWeight: 600, padding: "18px 0 8px" }}>
            <span style={{ display: "flex", transform: macros ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>
              <Icon d={P_CHEVRON} size={14} color={INK_SOFT} />
            </span>
            Makro (opcjonalnie)
          </button>
          {macros && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {numField("Białko", p, setP)}
              {numField("Węglow.", c, setC)}
              {numField("Tłuszcze", f, setF)}
            </div>
          )}

          <label style={{ ...caption(), display: "block", margin: "18px 0 8px" }}>Posiłek <span style={{ color: MUTED }}>(opcjonalnie)</span></label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setCat("")} className="press" style={pillBtn(!cat)}>Bez przypisania</button>
            {CATS.map(c2 => (
              <button key={c2} type="button" onClick={() => setCat(c2 === cat ? "" : c2)} className="press"
                style={pillBtn(c2 === cat)}>{c2}</button>
            ))}
          </div>

          {error && (
            <div style={{ marginTop: 16, background: RED_SOFT, color: RED_DEEP, borderRadius: R_CTRL,
              padding: "11px 13px", fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>{error}</div>
          )}

          <button type="submit" className="press" style={{ ...primaryBtn, width: "100%", marginTop: 18 }}>
            {isNew ? "Dodaj" : "Zapisz"}
          </button>

          {!isNew && (
            confirmDelete ? (
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 13, color: INK_SOFT }}>Usunąć ten wpis?</span>
                <button type="button" onClick={() => setConfirmDelete(false)} className="press" style={pillBtn(false)}>Anuluj</button>
                <button type="button" onClick={() => onDelete(entry.id)} className="press" style={pillBtn(true, RED)}>Usuń</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="press"
                style={{ width: "100%", marginTop: 12, border: `1px solid ${LINE}`, background: CARD, color: RED_DEEP,
                  borderRadius: R_CTRL, padding: "11px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon d={P_TRASH} size={15} color={RED_DEEP} /> Usuń wpis
              </button>
            )
          )}
        </div>
      </form>
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
  const [extras, setExtras] = useState({});   // ad-hoc entries per day, see QuickEntryModal
  const [quick, setQuick] = useState(null);  // the entry being added/edited, or null
  const [removing, setRemoving] = useState(null); // key of the row currently collapsing
  const [undo, setUndo] = useState(null);         // what the undo bar would put back
  const removeTimer = useRef(null);
  useEffect(() => () => clearTimeout(removeTimer.current), []);
  const [goals, setGoals] = useState(DEFAULT_GOALS);

  const alive = useRef(true);
  const stateRef = useRef({ plan, eaten, goals, extras });
  useEffect(() => { stateRef.current = { plan, eaten, goals, extras }; });

  // What the server is known to hold, recorded whenever a load succeeds. The sync effects below
  // compare against it so the state change caused by the load itself doesn't count as an edit -
  // without that, every app open pushed all three columns straight back up.
  const baseline = useRef({ plan, eaten, goals, extras });

  const loadPlan = useCallback(async () => {
    const { data, error } = await supabase
      .from("plans")
      .select("plan, eaten, goals, extras")
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
      extras: pending.extras ?? (data && data.extras) ?? cur.extras,
    };
    baseline.current = next;
    setPlan(next.plan);
    setEaten(next.eaten);
    setGoals(next.goals);
    setExtras(next.extras);

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
    const isOpen = !!(picker || modal || quick);
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (!isOpen) return () => { document.body.style.overflow = ""; };
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null); else if (quick) setQuick(null); else setPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [picker, modal, quick]);

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

  useEffect(() => { syncCol("extras", extras); }, [extras, loaded, user.id]);

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

  // Removing a meal takes out the day's entry and nothing else: a planned meal keeps its recipe in
  // RECIPES (a static catalogue we never write to), and the other meals of the day are untouched.
  // The row collapses first, then the state change lands, so the list animates out.
  const pendingRemoval = useRef(null);

  const commitRemoval = () => {
    const p = pendingRemoval.current;
    if (!p) return;
    pendingRemoval.current = null;
    clearTimeout(removeTimer.current);
    p.commit();
    setUndo(p.undoState);
  };

  const removeRow = (key, commit, undoState) => {
    commitRemoval();                       // a second delete must land the first, not cancel it
    pendingRemoval.current = { commit, undoState };
    setRemoving(key);
    removeTimer.current = setTimeout(() => { setRemoving(null); commitRemoval(); }, 200);
  };

  const removeMeal = cat => {
    const id = (plan[selected] || {})[cat];
    const r = byId[id];
    const wasEaten = !!(eaten[selected] || {})[cat];
    const date = selected;
    removeRow(`meal:${cat}`, () => setMeal(date, cat, null),
      { message: `Usunięto: ${r ? r.name : cat}`, restore: () => {
        setPlan(p => ({ ...p, [date]: { ...(p[date] || {}), [cat]: id } }));
        if (wasEaten) setEaten(p => ({ ...p, [date]: { ...(p[date] || {}), [cat]: true } }));
      } });
  };

  const removeQuick = entry => {
    const date = selected;
    const index = (extras[date] || []).findIndex(e => e.id === entry.id);
    removeRow(`quick:${entry.id}`, () => deleteQuick(entry.id),
      { message: `Usunięto: ${entry.name}`, restore: () => setExtras(p => {
        const list = [...(p[date] || [])];
        list.splice(Math.min(index < 0 ? list.length : index, list.length), 0, entry);
        return { ...p, [date]: list };
      }) });
  };

  const saveQuick = item => setExtras(p => {
    const list = (p[selected] || []).filter(e => e.id !== item.id);
    return { ...p, [selected]: [...list, item] };
  });

  const deleteQuick = id => setExtras(p => {
    const list = (p[selected] || []).filter(e => e.id !== id);
    const np = { ...p };
    if (list.length) np[selected] = list; else delete np[selected];
    return np;
  });

  const fillDay = () => {
    setEaten(p => {
      if (!p[selected]) return p;
      const np = { ...p };
      delete np[selected];
      return np;
    });
    const goal = drawTarget;
    const current = CATS.map(c => (plan[selected] || {})[c]).join(",");
    let pick = null;
    for (let attempt = 0; attempt < 4; attempt++) { // re-draw if we land on the day already shown
      pick = drawDay(goal);
      if (pick.map(r => r.id).join(",") !== current) break;
    }
    setPlan(p => ({ ...p, [selected]: Object.fromEntries(CATS.map((cat, i) => [cat, pick[i].id])) }));
  };

  // A day's numbers are the planned meals plus anything logged ad-hoc that day.
  const dayTotals = dateKey => {
    const day = plan[dateKey] || {};
    let kcal=0,pr=0,f=0,c=0,n=0;
    CATS.forEach(cat => { const r = byId[day[cat]]; if (r){ kcal+=r.kcal; pr+=r.p; f+=r.f; c+=r.c; n++; } });
    const q = quickTotals(extras[dateKey]);
    kcal+=q.kcal; pr+=q.p; f+=q.f; c+=q.c; n+=q.n;
    return n ? { kcal, p: pr, f, c, n, quick: q } : null;
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
  // The draw aims at what is left of the goal once ad-hoc entries are accounted for. Four meals
  // can never total less than MIN_DAY, so a big quick entry can put that target out of reach -
  // the button says which number it is really aiming at and the hint owns up when it cannot hit it.
  const quickKcal = quickTotals(extras[selected]).kcal;
  const drawTarget = targetFor(selected) - quickKcal;

  const dateInput = {
    width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: R_CTRL,
    border: `1px solid ${LINE}`, background: FILL, fontSize: 14.5, fontWeight: 500, color: INK, ...NUM
  };
  const linkBtn = { border: "none", background: "none", color: INK_SOFT, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 2px" };

  return (
    <div style={{ minHeight: "100dvh", background: BG, fontFamily: FONT, color: INK, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button, input, textarea, select { font-family: inherit; }
        button { color: inherit; }
        input:focus-visible, button:focus-visible, [role="button"]:focus-visible {
          outline: 2px solid ${GREEN}; outline-offset: 2px;
        }
        .press { transition: transform .14s cubic-bezier(.2,.8,.3,1), background-color .14s ease, box-shadow .14s ease, border-color .14s ease; }
        .press:active { transform: scale(.978); }
        .row { transition: background-color .14s ease; }
        .clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .ellip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @media (hover: hover) { .row:hover { background: #FAFAFB; } }
        @media (max-width: 880px) { .split { grid-template-columns: 1fr !important; } }
      `}</style>

      <header style={{
        position: "sticky", top: 0, zIndex: 30, background: "rgba(255,255,255,.82)",
        backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: `1px solid ${LINE}`, padding: "calc(14px + env(safe-area-inset-top)) 16px 12px"
      }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Planer diety</h1>
              <div style={{ ...caption({ marginTop: 2 }), ...NUM }}>{RECIPES.length} {plural(RECIPES.length, "przepis", "przepisy", "przepisów")} · cel {goals.global} kcal</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {unsaved && (
                <span title="Zmiany są zapisane w tej przeglądarce i zostaną wysłane na serwer, gdy tylko się uda."
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: AMBER_SOFT, color: AMBER_DEEP,
                    borderRadius: R_PILL, padding: "5px 11px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ width: 6, height: 6, borderRadius: R_PILL, background: AMBER }} />
                  {online ? "Zapisywanie…" : "Offline"}
                </span>
              )}
              <button onClick={() => supabase.auth.signOut()} title={user.email} className="press"
                style={{ border: `1px solid ${LINE}`, background: CARD, color: INK_SOFT, borderRadius: R_PILL,
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Wyloguj</button>
            </div>
          </div>
          <nav style={{ marginTop: 12 }}>
            <Segmented value={tab} onChange={setTab}
              options={[["cal", "Kalendarz"], ["shop", "Lista zakupów"], ["progress", "Postępy"]]} />
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 16px calc(60px + env(safe-area-inset-bottom))" }}>
        {tab !== "progress" && loadState === "loading" && <div style={{ color: MUTED, fontSize: 14, padding: "8px 2px" }}>Wczytywanie planu…</div>}

        {tab !== "progress" && loadState === "error" && (
          <section style={{ ...cardStyle, maxWidth: 560, margin: "0 auto", padding: 22 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px", letterSpacing: -0.4 }}>Nie udało się wczytać planu</h2>
            <p style={{ fontSize: 14, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 18px" }}>
              Twój plan jest bezpieczny — po prostu nie mamy do niego teraz dostępu. Edycja jest wyłączona,
              żeby przypadkiem nie nadpisać go pustym planem. {unsaved && "Niewysłane zmiany czekają w tej przeglądarce. "}
              Próbujemy ponownie automatycznie co 15 sekund.
            </p>
            <button onClick={() => { setLoadState("loading"); loadPlan(); }} className="press" style={{
              background: GREEN, color: "#fff", border: "none", borderRadius: R_CTRL, padding: "12px 20px",
              fontSize: 14.5, fontWeight: 600, cursor: "pointer", boxShadow: GREEN_GLOW
            }}>Spróbuj ponownie</button>
          </section>
        )}

        {tab === "cal" && loaded && (
          <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1fr)", gap: 18, alignItems: "start" }}>
            {/* DAY PANEL */}
            <section style={cardStyle}>
              <div style={sectionLabel()}>{dowOf(selected)}</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 16px", letterSpacing: -0.7, lineHeight: 1.1 }}>{fmtPL(selected)}</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                <span style={caption({ marginRight: 2 })}>Cel</span>
                {TARGETS.map(t => (
                  <button key={t} onClick={() => setDayGoal(t)} className="press" style={pillBtn(targetFor(selected) === t)}>{t}</button>
                ))}
                {goals.days[selected] && goals.days[selected] !== goals.global && (
                  <button onClick={makeGlobalGoal} title="Użyj tego celu dla wszystkich dni bez własnego celu" className="press"
                    style={{ ...linkBtn, color: GREEN_DEEP }}>Ustaw domyślny</button>
                )}
              </div>

              {totals
                ? (() => {
                    const goal = targetFor(selected);
                    const diff = totals.kcal - goal;
                    const onTrack = Math.abs(diff) <= 50;
                    const tone = onTrack ? { bar: GREEN, bg: GREEN_SOFT, fg: GREEN_DEEP }
                      : diff > 0 ? { bar: RED, bg: RED_SOFT, fg: RED_DEEP }
                      : { bar: AMBER, bg: AMBER_SOFT, fg: AMBER_DEEP };
                    const eDay = eaten[selected] || {};
                    let eKcal = 0, eN = 0;
                    CATS.forEach(cat => { const r = byId[sel[cat]]; if (r && eDay[cat]) { eKcal += r.kcal; eN++; } });
                    // Ad-hoc entries are logged after the fact, so they always count as eaten.
                    eKcal += totals.quick.kcal; eN += totals.quick.n;
                    return (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, ...NUM }}>{totals.kcal}</span>
                            <span style={{ fontSize: 14, color: MUTED, fontWeight: 500, ...NUM }}>/ {goal} kcal</span>
                          </div>
                          <span style={{ background: tone.bg, color: tone.fg, borderRadius: R_PILL, padding: "4px 11px", fontSize: 13, fontWeight: 600, ...NUM }}>
                            {diff >= 0 ? "+" : "−"}{Math.abs(diff)}
                          </span>
                        </div>
                        <div style={{ height: 8, background: FILL, borderRadius: R_PILL, margin: "12px 0 9px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, totals.kcal / goal * 100)}%`, height: "100%", background: tone.bar,
                            borderRadius: R_PILL, transition: "width .35s cubic-bezier(.2,.8,.3,1)" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: MUTED, ...NUM }}>
                          <span>B {totals.p} · T {totals.f} · W {totals.c}</span>
                          <span style={{ color: eN ? GREEN_DEEP : MUTED, fontWeight: eN ? 600 : 500 }}>Zjedzone {eN}/{totals.n} · {eKcal} kcal</span>
                        </div>
                      </div>
                    );
                  })()
                : <div style={{ background: FILL, borderRadius: R_CTRL, padding: "16px 14px", marginBottom: 20, fontSize: 13.5, color: MUTED, lineHeight: 1.55 }}>
                    Brak zaplanowanych posiłków — wybierz je poniżej albo wylosuj cały dzień pod cel.
                  </div>}

              <div style={listBox}>
                {CATS.map((cat, i) => {
                  const r = byId[sel[cat]];
                  const isEaten = !!(eaten[selected] || {})[cat];
                  return (
                    <SwipeRow key={cat} disabled={!r} collapsing={removing === `meal:${cat}`}
                      background={isEaten ? GREEN_SOFT : CARD} onDelete={() => removeMeal(cat)}>
                    <div style={{ borderTop: i ? `1px solid ${LINE}` : "none", background: isEaten ? GREEN_SOFT : CARD }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px 0" }}>
                        <span style={{ background: CAT_TINT[cat].bg, color: CAT_TINT[cat].fg, borderRadius: R_PILL, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>{cat}</span>
                        {r && (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => setModal(r)} className="press" style={linkBtn}>Przepis</button>
                            <button onClick={() => toggleEaten(selected, cat)} title={isEaten ? "Cofnij oznaczenie" : "Oznacz jako zjedzone"} className="press"
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${isEaten ? GREEN : LINE}`,
                                background: isEaten ? GREEN : CARD, color: isEaten ? "#fff" : MUTED, borderRadius: R_PILL,
                                padding: "4px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                              {isEaten && <Icon d={P_CHECK} size={12} stroke={2.8} />}
                              {isEaten ? "Zjedzone" : "Zjedzone?"}
                            </button>
                          </span>
                        )}
                      </div>
                      <button onClick={() => setPicker(cat)} className="press row" style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                        border: "none", background: "transparent", cursor: "pointer",
                        padding: r ? "10px 12px 12px" : "12px 12px 16px"
                      }}>
                        {r ? (
                          <>
                            <RecipeThumb key={r.id} r={r} size={50} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="clamp2" style={{ fontSize: 14.5, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{r.name}</div>
                              <div style={{ marginTop: 6 }}><MacroChips r={r} size="sm" /></div>
                            </div>
                            <Icon d={P_CHEVRON} size={18} color={MUTED} />
                          </>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: GREEN_DEEP, fontSize: 14, fontWeight: 600 }}>
                            <Icon d={P_PLUS} size={16} color={GREEN_DEEP} stroke={2.2} /> Wybierz posiłek
                          </span>
                        )}
                      </button>
                    </div>
                    </SwipeRow>
                  );
                })}
              </div>

              {(extras[selected] || []).length > 0 && (
                <>
                  <div style={{ ...sectionLabel(), margin: "18px 2px 8px" }}>Dodatkowo</div>
                  <div style={listBox}>
                    {(extras[selected] || []).map((e, i) => (
                      <SwipeRow key={e.id} collapsing={removing === `quick:${e.id}`} onDelete={() => removeQuick(e)}>
                      <button onClick={() => setQuick(e)} className="press row" style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                        border: "none", borderTop: i ? `1px solid ${LINE}` : "none", background: "transparent",
                        cursor: "pointer", padding: "10px 12px"
                      }}>
                        <span style={{ width: 40, height: 40, borderRadius: 10, background: FILL, color: MUTED,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon d={P_EDIT} size={16} color={MUTED} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span className="clamp2" style={{ fontSize: 14.5, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{e.name}</span>
                            <span style={{ background: FILL, color: MUTED, borderRadius: R_PILL, padding: "1px 7px",
                              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>ręczny</span>
                          </span>
                          <span className="ellip" style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 3, ...NUM }}>
                            <b style={{ color: INK_SOFT, fontWeight: 600 }}>{e.kcal} kcal</b>
                            {e.p !== null && e.p !== undefined ? ` · B ${fmtNum(e.p)}` : ""}
                            {e.f !== null && e.f !== undefined ? ` · T ${fmtNum(e.f)}` : ""}
                            {e.c !== null && e.c !== undefined ? ` · W ${fmtNum(e.c)}` : ""}
                            {e.cat ? ` · ${e.cat}` : ""}
                          </span>
                        </span>
                        <Icon d={P_CHEVRON} size={18} color={MUTED} />
                      </button>
                      </SwipeRow>
                    ))}
                  </div>
                </>
              )}

              <button onClick={() => setQuick({})} className="press" style={{
                marginTop: 12, width: "100%", border: `1px solid ${LINE}`, background: CARD, color: GREEN_DEEP,
                borderRadius: R_CTRL, padding: "12px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}>
                <Icon d={P_PLUS} size={16} color={GREEN_DEEP} stroke={2.2} /> Szybki wpis
              </button>

              <button onClick={fillDay} className="press" style={{
                marginTop: 10, width: "100%", background: GREEN, color: "#fff", border: "none", borderRadius: R_CTRL,
                padding: "14px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: GREEN_GLOW
              }}>Wylosuj dzień pod {Math.max(drawTarget, 0)} kcal</button>
              <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 2px 0", lineHeight: 1.55 }}>
                Losuje 4 posiłki tak, aby suma trafiła w cel (±50 kcal). Kliknij ponownie, jeśli zestaw nie pasuje.
                {quickKcal > 0 && ` Odliczone ${quickKcal} kcal z szybkich wpisów.`}
              </p>
              {quickKcal > 0 && drawTarget < MIN_DAY && (
                <p style={{ fontSize: 12.5, color: AMBER_DEEP, background: AMBER_SOFT, borderRadius: R_CTRL,
                  padding: "10px 12px", margin: "10px 0 0", lineHeight: 1.55 }}>
                  Zostało {Math.max(drawTarget, 0)} kcal, a 4 posiłki z bazy to minimum {MIN_DAY} kcal — losowanie
                  wyjdzie ponad cel. Dobierz posiłki ręcznie albo usuń któryś szybki wpis.
                </p>
              )}
            </section>

            {/* CALENDAR */}
            <section style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <button onClick={() => setView(v => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}
                  className="press" aria-label="Poprzedni miesiąc" style={iconBtn}>
                  <Icon d={P_BACK} size={17} color={INK_SOFT} />
                </button>
                <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: -0.3 }}>{MONTHS[view.m]} {view.y}</div>
                <button onClick={() => setView(v => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}
                  className="press" aria-label="Następny miesiąc" style={iconBtn}>
                  <Icon d={P_CHEVRON} size={17} color={INK_SOFT} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600, color: MUTED, padding: "0 0 6px" }}>{d}</div>)}
                {weeks.flat().map((dt, i) => {
                  const k = keyOf(dt);
                  const inMonth = dt.getMonth() === view.m;
                  const isSel = k === selected;
                  const isToday = k === keyOf(today);
                  const t = dayTotals(k);
                  const day = plan[k] || {};
                  return (
                    <button key={i} onClick={() => setSelected(k)} className="press" style={{
                      border: isSel ? "1.5px solid transparent" : isToday ? `1.5px solid ${GREEN}` : "1.5px solid transparent",
                      background: isSel ? GREEN : t ? FILL : "transparent",
                      color: isSel ? "#fff" : isToday ? GREEN_DEEP : INK,
                      opacity: inMonth ? 1 : 0.4, borderRadius: 14, padding: "7px 2px 6px", minHeight: 58,
                      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4
                    }}>
                      <span style={{ fontSize: 14, fontWeight: isSel || isToday ? 700 : 500, ...NUM }}>{dt.getDate()}</span>
                      <span style={{ display: "flex", gap: 3, height: 5 }}>
                        {CATS.map(c => byId[day[c]] || (extras[k] || []).some(e => e.cat === c)
                          ? <span key={c} style={{ width: 5, height: 5, borderRadius: R_PILL, background: isSel ? "rgba(255,255,255,.92)" : CAT_COLORS[c] }} />
                          : null)}
                        {(extras[k] || []).some(e => !e.cat) && (
                          <span style={{ width: 5, height: 5, borderRadius: R_PILL, background: isSel ? "rgba(255,255,255,.92)" : MUTED }} />
                        )}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, height: 13, color: isSel ? "rgba(255,255,255,.9)" : MUTED, ...NUM }}>{t ? t.kcal : ""}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap", borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
                {CATS.map(c => (
                  <span key={c} style={{ fontSize: 12.5, color: INK_SOFT, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                    <span style={{ width: 8, height: 8, borderRadius: R_PILL, background: CAT_COLORS[c] }} />{c}
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "shop" && loaded && (
          <section style={{ ...cardStyle, maxWidth: 660, margin: "0 auto" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", letterSpacing: -0.5 }}>Lista zakupów</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ ...caption(), display: "block", marginBottom: 6 }}>Od</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInput} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ ...caption(), display: "block", marginBottom: 6 }}>Do</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateInput} />
              </div>
            </div>

            {shopping && shopping.total > 0 ? (
              <>
                <div style={{ background: GREEN_SOFT, borderRadius: R_CTRL, padding: "12px 14px", marginBottom: 20 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: GREEN_DEEP, ...NUM }}>
                    {shopping.days} {plural(shopping.days, "dzień", "dni", "dni")} · {shopping.meals} {plural(shopping.meals, "posiłek", "posiłki", "posiłków")} · {shopping.kcal} kcal
                  </div>
                  <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 3 }}>Ilości przeliczone na 1 porcję i zsumowane.</div>
                </div>
                {shopping.groups.map(group => {
                  const doneIn = group.items.filter(i => checked[i.key]).length;
                  return (
                    <div key={group.cat} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
                        <span style={sectionLabel()}>{group.cat}</span>
                        <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, ...NUM }}>{doneIn}/{group.items.length}</span>
                      </div>
                      <ul style={{ ...listBox, listStyle: "none", padding: 0, margin: 0 }}>
                        {group.items.map((item, idx) => {
                          const done = checked[item.key];
                          return (
                            <li key={item.key} style={{ borderTop: idx ? `1px solid ${LINE}` : "none" }}>
                              <label className="row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                                cursor: "pointer", background: done ? FILL : CARD }}>
                                <input type="checkbox" checked={!!done} onChange={() => toggleChecked(item.key)}
                                  style={{ width: 19, height: 19, accentColor: GREEN, flexShrink: 0, cursor: "pointer" }} />
                                <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: done ? MUTED : INK,
                                  textDecoration: done ? "line-through" : "none" }}>{item.name}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: done ? MUTED : INK_SOFT, ...NUM }}>{fmtG(item.g)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                <div style={{ fontSize: 13, color: MUTED, textAlign: "center", ...NUM }}>
                  Odhaczone: {Object.values(checked).filter(Boolean).length} / {shopping.total}
                </div>
              </>
            ) : (
              <div style={{ color: MUTED, fontSize: 14, padding: "32px 0", textAlign: "center", lineHeight: 1.6 }}>
                Brak posiłków w wybranym zakresie dat.<br />Zaplanuj dietę w zakładce Kalendarz.
              </div>
            )}
          </section>
        )}
        {tab === "progress" && <Progress user={user} />}
      </main>

      {picker && (
        <PickerModal cat={picker} currentId={(plan[selected] || {})[picker]}
          ctx={(() => {
            const day = plan[selected] || {};
            let others = 0, filled = 0;
            CATS.forEach(c => { if (c !== picker) { const r = byId[day[c]]; if (r) { others += r.kcal; filled++; } } });
            const q = quickTotals(extras[selected]);
            others += q.kcal; filled += q.n;
            const goal = targetFor(selected);
            return { others, filled, goal, remaining: goal - others };
          })()}
          onPick={id => { setMeal(selected, picker, id); setPicker(null); }}
          onPreview={r => setModal(r)}
          onClose={() => setPicker(null)} />
      )}
      {modal && <RecipeModal key={modal.id} recipe={modal} onClose={() => setModal(null)} />}
      {undo && (
        <UndoToast message={undo.message}
          onUndo={() => { undo.restore(); setUndo(null); }}
          onDismiss={() => setUndo(null)} />
      )}
      {quick && (
        <QuickEntryModal entry={quick} dayLabel={fmtPL(selected)}
          onSave={item => { saveQuick(item); setQuick(null); }}
          onDelete={id => { deleteQuick(id); setQuick(null); }}
          onClose={() => setQuick(null)} />
      )}
    </div>
  );
}
