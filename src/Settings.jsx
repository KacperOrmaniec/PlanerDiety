import { useState, useRef, useEffect, useMemo } from "react";
import { RECIPES } from "./data/recipes.js";
import { CATS } from "./slots.js";
import { DIET_GROUPS, GROUP_OF } from "./diets.js";

import {
  GREEN, GREEN_DEEP, CARD, INK, INK_SOFT, MUTED, LINE, FILL,
  AMBER_SOFT, AMBER_DEEP, R_CTRL, NUM,
  caption, listBox, iconBtn, pillBtn, fieldStyle, overlay, sheet,
  plural, P_CHEVRON, P_CLOSE, P_SEARCH, Icon,
} from "./ui.jsx";

// "Dostosuj dietę": switch recipes off so they stop being offered anywhere in the app.
//
// The screen is grouped by the recipe's own category because that is the axis that makes 280 rows
// manageable - 70 apiece, each recipe appearing exactly once - while the diet-group chips cut
// across it, so "wyłącz całą Dietę 5" is a chip plus one bulk tap. Sections start collapsed and
// only render their rows when open, which is also what keeps 280 rows off the first paint.
//
// Hiding is stored as ids in `plans.hidden` and is global: a recipe switched off here is gone from
// every slot it could be served in, not just from the section it was switched off in.
const BY_CAT = Object.fromEntries(CATS.map(cat => [cat, RECIPES.filter(r => r.cat === cat)]));

// A native checkbox that can also sit in the "some of this group" state, which only JS can set.
function TriCheckbox({ checked, indeterminate, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !checked && !!indeterminate; },
    [checked, indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...rest}
    style={{ width: 19, height: 19, accentColor: GREEN, flexShrink: 0, cursor: "pointer" }} />;
}

export default function Settings({ hidden, hiddenSet, catalogue, schemaReady, onChange, onClose }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(null);
  const [open, setOpen] = useState({});
  const query = q.trim().toLowerCase();
  const filtering = !!query || !!group;

  const match = r => (!group || GROUP_OF[r.diet] === group) && (!query || r.name.toLowerCase().includes(query));

  const sections = useMemo(() => CATS.map(cat => {
    const all = BY_CAT[cat];
    const items = all.filter(match);
    return {
      cat, all, items,
      visible: all.reduce((n, r) => n + (hiddenSet.has(r.id) ? 0 : 1), 0),
      shownVisible: items.reduce((n, r) => n + (hiddenSet.has(r.id) ? 0 : 1), 0),
    };
  }), [hiddenSet, query, group]);

  const nothingMatches = sections.every(sec => !sec.items.length);
  const allHidden = catalogue.visible === 0;

  // Every write goes through here: a set in, a plain array out, so `hidden` stays the exceptions to
  // the default and never a copy of the catalogue.
  const apply = (ids, hide) => {
    const next = new Set(hiddenSet);
    for (const id of ids) { if (hide) next.add(id); else next.delete(id); }
    onChange([...next]);
  };

  const restore = () => onChange([]);
  const hideAll = () => onChange(RECIPES.map(r => r.id));

  const linkBtn = { border: "none", background: "none", color: GREEN_DEEP, fontSize: 12.5,
    fontWeight: 600, cursor: "pointer", padding: "4px 2px" };

  return (
    <div onClick={onClose} style={overlay(48)}>
      <div onClick={e => e.stopPropagation()} style={{
        ...sheet, maxWidth: 620, maxHeight: "92dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>Dostosuj dietę</h2>
              <div style={{ ...caption({ fontSize: 12.5, marginTop: 3 }), ...NUM }}>
                Widoczne: <b style={{ color: catalogue.visible ? GREEN_DEEP : AMBER_DEEP, fontWeight: 700 }}>{catalogue.visible}</b> / {RECIPES.length}
              </div>
            </div>
            <button onClick={onClose} className="press" aria-label="Zamknij" style={iconBtn}>
              <Icon d={P_CLOSE} size={15} color={INK_SOFT} stroke={2.2} />
            </button>
          </div>

          {!schemaReady && (
            <div style={{ marginTop: 12, background: AMBER_SOFT, color: AMBER_DEEP, borderRadius: R_CTRL,
              padding: "11px 13px", fontSize: 12.5, fontWeight: 500, lineHeight: 1.5 }}>
              Ten wybór nie ma się gdzie zapisać — brakuje kolumny <b>hidden</b>. Uruchom ponownie
              <b> supabase/schema.sql</b> w panelu Supabase. Do tego czasu lista jest tylko do odczytu.
            </div>
          )}

          <div style={{ position: "relative", marginTop: 12 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
              <Icon d={P_SEARCH} size={16} color={MUTED} />
            </span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj po nazwie…"
              style={{ ...fieldStyle, padding: "11px 12px 11px 38px", fontVariantNumeric: "normal" }} />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={caption({ marginRight: 2 })}>Plan</span>
            <button onClick={() => setGroup(null)} className="press" style={pillBtn(!group)}>Wszystkie</button>
            {DIET_GROUPS.map(g => (
              <button key={g.label} onClick={() => setGroup(g === group ? null : g)} className="press"
                style={pillBtn(g === group)}>{g.label}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={restore} disabled={!schemaReady || !hidden.length} className="press"
              style={{ ...linkBtn, opacity: !schemaReady || !hidden.length ? 0.4 : 1,
                cursor: !schemaReady || !hidden.length ? "default" : "pointer" }}>Zaznacz wszystkie</button>
            <button onClick={hideAll} disabled={!schemaReady || allHidden} className="press"
              style={{ ...linkBtn, color: MUTED, opacity: !schemaReady || allHidden ? 0.4 : 1,
                cursor: !schemaReady || allHidden ? "default" : "pointer" }}>Odznacz wszystkie</button>
            {!!hidden.length && (
              <span style={caption({ fontSize: 12, marginLeft: "auto" })}>
                Wyłączone: {hidden.length} {plural(hidden.length, "przepis", "przepisy", "przepisów")}
              </span>
            )}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 14px 20px" }}>
          {allHidden && (
            <div style={{ background: AMBER_SOFT, borderRadius: R_CTRL, padding: "14px 15px", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: AMBER_DEEP, marginBottom: 4 }}>Wszystkie przepisy są wyłączone</div>
              <div style={{ fontSize: 12.5, color: AMBER_DEEP, lineHeight: 1.55, marginBottom: 12 }}>
                Nie ma z czego wybierać posiłków ani losować dnia. Włącz z powrotem to, co chcesz jadać,
                albo wróć do stanu wyjściowego.
              </div>
              <button onClick={restore} disabled={!schemaReady} className="press" style={{
                border: "none", background: GREEN, color: "#fff", borderRadius: R_CTRL, padding: "10px 16px",
                fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Przywróć domyślne</button>
            </div>
          )}

          {!allHidden && !!catalogue.emptySlots.length && (
            <div style={{ background: AMBER_SOFT, color: AMBER_DEEP, borderRadius: R_CTRL, padding: "11px 13px",
              marginBottom: 14, fontSize: 12.5, fontWeight: 500, lineHeight: 1.5 }}>
              Losowanie dnia jest wyłączone: w {catalogue.emptySlots.length === 1 ? "kategorii" : "kategoriach"}{" "}
              <b>{catalogue.emptySlots.join(", ")}</b> nie został żaden widoczny przepis. Ręczny wybór pozostałych posiłków działa dalej.
            </div>
          )}

          {nothingMatches && (
            <div style={{ padding: "34px 10px", textAlign: "center", color: MUTED, fontSize: 13.5, lineHeight: 1.6 }}>
              Nic nie pasuje do wyszukiwania.
            </div>
          )}

          {sections.map(sec => {
            if (!sec.items.length) return null;
            const expanded = filtering || !!open[sec.cat];
            const allOn = sec.shownVisible === sec.items.length;
            const someOn = sec.shownVisible > 0;
            return (
              <div key={sec.cat} style={{ ...listBox, marginBottom: 12 }}>
                {/* The group checkbox is a sibling of the expand button, not inside it: nested, every
                    tap meant to open the section would also switch the whole category off. It acts on
                    what the filter currently shows, which is what makes "wyłącz całą Dietę 5" work. */}
                <div style={{ display: "flex", alignItems: "stretch", background: FILL }}>
                  <label style={{ display: "flex", alignItems: "center", padding: "0 0 0 14px", cursor: "pointer" }}
                    title={allOn ? `Wyłącz ${filtering ? "widoczne" : "wszystkie"} w tej kategorii` : "Włącz z powrotem"}>
                    <TriCheckbox checked={allOn} indeterminate={someOn} disabled={!schemaReady}
                      onChange={() => apply(sec.items.map(r => r.id), allOn)} />
                  </label>
                  <button onClick={() => setOpen(o => ({ ...o, [sec.cat]: !o[sec.cat] }))} className="press"
                    aria-expanded={expanded} style={{
                      flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      border: "none", background: "transparent", cursor: "pointer", padding: "11px 13px 11px 12px" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: INK }}>{sec.cat}</span>
                    <span style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: sec.visible ? MUTED : AMBER_DEEP }}>
                      {filtering ? `${sec.shownVisible} / ${sec.items.length}` : `${sec.visible} / ${sec.all.length}`}
                    </span>
                    <span style={{ display: "flex", transform: expanded ? "rotate(90deg)" : "none",
                      transition: "transform .2s cubic-bezier(.2,.8,.3,1)" }}>
                      <Icon d={P_CHEVRON} size={15} color={MUTED} />
                    </span>
                  </button>
                </div>

                {expanded && sec.items.map(r => {
                  const on = !hiddenSet.has(r.id);
                  return (
                    <label key={r.id} className="row" style={{ display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 14px", borderTop: `1px solid ${LINE}`, cursor: "pointer",
                      background: on ? CARD : FILL }}>
                      <input type="checkbox" checked={on} disabled={!schemaReady}
                        onChange={() => apply([r.id], on)}
                        style={{ width: 19, height: 19, accentColor: GREEN, flexShrink: 0, cursor: "pointer" }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="clamp2" style={{ display: "block", fontSize: 14, fontWeight: 600,
                          lineHeight: 1.3, color: on ? INK : MUTED }}>{r.name}</span>
                        <span style={{ display: "block", ...caption({ fontSize: 11.5, marginTop: 2 }), ...NUM }}>
                          {r.kcal} kcal{GROUP_OF[r.diet] ? ` · plan ${GROUP_OF[r.diet].kcal}` : " · własny"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}

          <p style={caption({ fontSize: 12, margin: "4px 4px 0", lineHeight: 1.55 })}>
            Wyłączony przepis znika z wyboru posiłków i z losowania dnia. Posiłki, które masz już
            zaplanowane, zostają na swoim miejscu — razem z listą zakupów i podsumowaniem dnia.
          </p>
        </div>
      </div>
    </div>
  );
}
