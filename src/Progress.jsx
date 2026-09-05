import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "./lib/supabaseClient.js";
import {
  GREEN, GREEN_DEEP, GREEN_SOFT, BG, CARD, INK, INK_SOFT, MUTED, LINE, FILL,
  AMBER, AMBER_SOFT, AMBER_DEEP, RED, RED_SOFT, RED_DEEP, BLUE, TEAL, PINK,
  R_CTRL, R_PILL, SHADOW_SM, NUM, keyOf, fmtPL, fmtShort, dateOf, plural,
  caption, sectionLabel, cardStyle, listBox, iconBtn, pillBtn, primaryBtn, fieldStyle,
  overlay, sheet, Segmented, SafeImg,
  P_CHEVRON, P_CLOSE, P_PLUS, P_CAMERA, P_TRASH, P_SHARE, P_EDIT,
  P_ARROW_DOWN, P_ARROW_UP, P_MINUS, Icon,
} from "./ui.jsx";

// A ProgressEntry is one check-in on a user-chosen date. Every field is optional on purpose:
// somebody may weigh themselves in the morning and take photos in the evening, or track only
// weight for a few weeks. Charts therefore plot each metric over the entries that actually
// carry it and simply skip the gaps.
const BUCKET = "progress-photos";

// `better` says which direction counts as progress, and is only used to colour a delta.
// Biceps and muscle percentage read as gains; everything else reads as losses.
const METRICS = [
  { key: "weight",            label: "Waga",       short: "Waga",    unit: "kg", color: GREEN,      better: "down", max: 400 },
  { key: "waist",             label: "Talia",      short: "Talia",   unit: "cm", color: BLUE,       better: "down", max: 300 },
  { key: "hips",              label: "Biodra",     short: "Biodra",  unit: "cm", color: TEAL,       better: "down", max: 300 },
  { key: "thigh",             label: "Udo",        short: "Udo",     unit: "cm", color: PINK,       better: "down", max: 300 },
  { key: "biceps",            label: "Biceps",     short: "Biceps",  unit: "cm", color: AMBER,      better: "up",   max: 300 },
  { key: "body_fat_percent",  label: "% tłuszczu", short: "Tłuszcz", unit: "%",  color: RED,        better: "down", max: 100 },
  { key: "muscle_percent",    label: "% mięśni",   short: "Mięśnie", unit: "%",  color: GREEN_DEEP, better: "up",   max: 100 },
];
const BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m]));
const CIRCUMFERENCES = ["waist", "hips", "thigh", "biceps"];
const ADVANCED = ["body_fat_percent", "muscle_percent"];
const SLOTS = [["photo_front", "Przód"], ["photo_side", "Bok"], ["photo_back", "Tył"]];

const RANGES = [["1m", "1 mies."], ["3m", "3 mies."], ["6m", "6 mies."], ["1y", "Rok"], ["all", "Całość"]];
const RANGE_DAYS = { "1m": 31, "3m": 92, "6m": 183, "1y": 366 };

// Polish writes decimals with a comma; accept either on input, always show a comma.
const fmtNum = v => (v === null || v === undefined || v === "" ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));
const parseNum = raw => {
  const t = String(raw).trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const thumbOf = path => path && path.replace(/\.jpg$/, "_thumb.jpg");

// Downscale before upload: phone photos are several MB and are shown at most a few hundred px.
function resize(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Nie udało się przetworzyć zdjęcia."))), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Nie udało się odczytać pliku.")); };
    img.src = url;
  });
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// --- Chart ---------------------------------------------------------------
// The web stand-in for Swift Charts: an inline SVG line with an area wash, a dot per real
// measurement and a draggable readout. Only entries that carry the metric become points, so a
// partially filled check-in leaves a gap rather than a zero.
function Chart({ points, color, height = 190, compact = false, unit = "" }) {
  const [ref, w] = useWidth();
  const [sel, setSel] = useState(null);

  const padL = compact ? 0 : 38, padR = compact ? 0 : 14, padT = compact ? 6 : 14, padB = compact ? 6 : 24;
  const innerW = Math.max(0, w - padL - padR);
  const innerH = height - padT - padB;

  const geom = useMemo(() => {
    if (!points.length || innerW <= 0) return null;
    const ys = points.map(p => p.y);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const spread = hi - lo;
    const pad = spread < 0.5 ? 1 : spread * 0.18;
    lo -= pad; hi += pad;
    const xs = points.map(p => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const sx = v => (x1 === x0 ? padL + innerW / 2 : padL + ((v - x0) / (x1 - x0)) * innerW);
    const sy = v => padT + innerH - ((v - lo) / (hi - lo)) * innerH;
    return { pts: points.map(p => ({ ...p, cx: sx(p.x), cy: sy(p.y) })), lo, hi, sy };
  }, [points, innerW, innerH, padL, padT]);

  const empty = !points.length;
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      {empty || !geom ? (
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 13 }}>
          {empty ? "Brak danych dla tej metryki" : ""}
        </div>
      ) : (
        <svg width="100%" height={height} style={{ display: "block", touchAction: "pan-y" }}
          onPointerDown={e => {
            const box = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - box.left;
            let best = geom.pts[0];
            for (const p of geom.pts) if (Math.abs(p.cx - x) < Math.abs(best.cx - x)) best = p;
            setSel(best);
          }}
          onPointerLeave={() => setSel(null)}>
          <defs>
            <linearGradient id={`g-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {!compact && [geom.hi, (geom.hi + geom.lo) / 2, geom.lo].map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={geom.sy(v)} x2={w - padR} y2={geom.sy(v)} stroke={LINE} strokeWidth="1" />
              <text x={padL - 7} y={geom.sy(v) + 4} textAnchor="end" fontSize="10.5" fill={MUTED} style={NUM}>{fmtNum(v)}</text>
            </g>
          ))}

          {geom.pts.length > 1 && (
            <path d={`M${geom.pts.map(p => `${p.cx},${p.cy}`).join("L")}L${geom.pts[geom.pts.length - 1].cx},${padT + innerH}L${geom.pts[0].cx},${padT + innerH}Z`}
              fill={`url(#g-${color.slice(1)})`} />
          )}
          <path d={`M${geom.pts.map(p => `${p.cx},${p.cy}`).join("L")}`} fill="none" stroke={color}
            strokeWidth={compact ? 2 : 2.4} strokeLinecap="round" strokeLinejoin="round" />
          {geom.pts.map(p => (
            <circle key={p.k} cx={p.cx} cy={p.cy} r={compact ? 2.4 : (sel && sel.k === p.k ? 5 : 3.4)}
              fill={CARD} stroke={color} strokeWidth="2" />
          ))}

          {!compact && (
            <>
              <text x={padL} y={height - 6} fontSize="10.5" fill={MUTED}>{fmtShort(geom.pts[0].k)}</text>
              {geom.pts.length > 1 && (
                <text x={w - padR} y={height - 6} textAnchor="end" fontSize="10.5" fill={MUTED}>
                  {fmtShort(geom.pts[geom.pts.length - 1].k)}
                </text>
              )}
            </>
          )}
          {sel && !compact && <line x1={sel.cx} y1={padT} x2={sel.cx} y2={padT + innerH} stroke={color} strokeWidth="1" strokeDasharray="3 3" />}
        </svg>
      )}
      {sel && !compact && (
        <div style={{
          position: "absolute", top: 0, left: Math.min(Math.max(sel.cx - 52, 0), Math.max(0, w - 108)),
          background: INK, color: "#fff", borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 600,
          pointerEvents: "none", whiteSpace: "nowrap", ...NUM
        }}>
          {fmtNum(sel.y)} {unit} · {fmtShort(sel.k)}
        </div>
      )}
    </div>
  );
}

// --- Delta ---------------------------------------------------------------
function Delta({ metric, from, to, size = "md" }) {
  if (from === null || from === undefined || to === null || to === undefined) return null;
  const d = to - from;
  const flat = Math.abs(d) < 0.05;
  const good = metric.better === "down" ? d < 0 : d > 0;
  const tone = flat ? { bg: FILL, fg: MUTED } : good ? { bg: GREEN_SOFT, fg: GREEN_DEEP } : { bg: RED_SOFT, fg: RED_DEEP };
  const s = size === "sm";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tone.bg, color: tone.fg,
      borderRadius: R_PILL, padding: s ? "2px 8px" : "4px 10px", fontSize: s ? 11.5 : 13, fontWeight: 600, ...NUM }}>
      <Icon d={flat ? P_MINUS : d < 0 ? P_ARROW_DOWN : P_ARROW_UP} size={s ? 11 : 13} stroke={2.4} />
      {flat ? "0" : `${fmtNum(Math.abs(d))} ${metric.unit}`}
    </span>
  );
}

// --- Photo slot ----------------------------------------------------------
function PhotoSlot({ label, url, onPick, onClear, busy }) {
  const inputRef = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 96 }}>
      <div style={{ ...caption({ fontSize: 11.5 }), marginBottom: 6, textAlign: "center" }}>{label}</div>
      <div style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: R_CTRL, overflow: "hidden",
        background: FILL, border: `1px solid ${LINE}` }}>
        {url ? (
          <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <button type="button" onClick={() => inputRef.current.click()} className="press"
            style={{ position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: MUTED }}>
            <Icon d={P_CAMERA} size={22} color={MUTED} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Dodaj</span>
          </button>
        )}
        {url && (
          <button type="button" onClick={onClear} aria-label={`Usuń zdjęcie: ${label}`} className="press"
            style={{ ...iconBtn, position: "absolute", top: 6, right: 6, width: 26, height: 26,
              background: "rgba(255,255,255,.92)", boxShadow: SHADOW_SM }}>
            <Icon d={P_CLOSE} size={13} color={INK} stroke={2.4} />
          </button>
        )}
        {busy && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.7)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: INK_SOFT }}>…</div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) onPick(f); e.target.value = ""; }} />
    </div>
  );
}

// --- Entry editor --------------------------------------------------------
function EntryEditor({ user, entry, taken, urls, onSaved, onDeleted, onClose }) {
  const isNew = !entry.id;
  const [date, setDate] = useState(entry.date || keyOf(new Date()));
  const [vals, setVals] = useState(() =>
    Object.fromEntries(METRICS.map(m => [m.key, entry[m.key] === null || entry[m.key] === undefined ? "" : fmtNum(entry[m.key])])));
  const [note, setNote] = useState(entry.note || "");
  const [advanced, setAdvanced] = useState(ADVANCED.some(k => entry[k] !== null && entry[k] !== undefined));
  // For each slot: undefined = untouched, null = remove, File = replace.
  const [pending, setPending] = useState({});
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => () => Object.values(previews).forEach(URL.revokeObjectURL), [previews]);

  const photoUrl = slot => {
    if (previews[slot]) return previews[slot];
    if (pending[slot] === null) return null;
    return entry[slot] ? urls[entry[slot]] : null;
  };

  const pickPhoto = (slot, file) => {
    setPreviews(p => { if (p[slot]) URL.revokeObjectURL(p[slot]); return { ...p, [slot]: URL.createObjectURL(file) }; });
    setPending(p => ({ ...p, [slot]: file }));
  };
  const clearPhoto = slot => {
    setPreviews(p => { if (p[slot]) URL.revokeObjectURL(p[slot]); const n = { ...p }; delete n[slot]; return n; });
    setPending(p => ({ ...p, [slot]: null }));
  };

  const save = async () => {
    setError("");
    if (!date) { setError("Wybierz datę pomiaru."); return; }
    if (taken.some(e => e.date === date && e.id !== entry.id)) {
      setError("Masz już wpis na ten dzień — otwórz go z listy, żeby go uzupełnić.");
      return;
    }

    const numbers = {};
    for (const m of METRICS) {
      const n = parseNum(vals[m.key]);
      if (Number.isNaN(n)) { setError(`Nieprawidłowa liczba w polu „${m.label}”.`); return; }
      if (n !== null && (n <= 0 || n > m.max)) { setError(`„${m.label}” poza sensownym zakresem (0–${m.max} ${m.unit}).`); return; }
      numbers[m.key] = n;
    }

    const keptPhotos = SLOTS.filter(([slot]) => pending[slot] instanceof File || (pending[slot] !== null && entry[slot]));
    const hasAnything = METRICS.some(m => numbers[m.key] !== null) || keptPhotos.length > 0 || note.trim();
    if (!hasAnything) { setError("Wpis jest pusty — dodaj przynajmniej jeden pomiar, zdjęcie albo notatkę."); return; }

    setBusy(true);
    const id = entry.id || crypto.randomUUID();
    const row = { id, user_id: user.id, date, note: note.trim() || null, ...numbers, updated_at: new Date().toISOString() };
    const toRemove = [];

    try {
      for (const [slot] of SLOTS) {
        const change = pending[slot];
        if (change === undefined) { row[slot] = entry[slot] || null; continue; }
        if (change === null) {
          if (entry[slot]) toRemove.push(entry[slot], thumbOf(entry[slot]));
          row[slot] = null;
          continue;
        }
        const path = `${user.id}/${id}/${slot}.jpg`;
        const full = await resize(change, 1400, 0.82);
        const thumb = await resize(change, 320, 0.75);
        for (const [p, blob] of [[path, full], [thumbOf(path), thumb]]) {
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(p, blob, { upsert: true, contentType: "image/jpeg" });
          if (upErr) throw upErr;
        }
        row[slot] = path;
      }

      const { data, error: dbErr } = await supabase.from("progress").upsert(row, { onConflict: "id" }).select().single();
      if (dbErr) throw dbErr;
      if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);
      onSaved(data);
    } catch (e) {
      console.error(e);
      setError(e.message && /bucket|storage|not found/i.test(e.message)
        ? "Nie udało się wysłać zdjęcia — sprawdź, czy w Supabase istnieje bucket „progress-photos” (patrz supabase/schema.sql)."
        : `Nie udało się zapisać: ${e.message || e}`);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const paths = SLOTS.map(([s]) => entry[s]).filter(Boolean).flatMap(p => [p, thumbOf(p)]);
    const { error: dbErr } = await supabase.from("progress").delete().eq("id", entry.id);
    if (dbErr) { console.error(dbErr); setError(`Nie udało się usunąć: ${dbErr.message}`); setBusy(false); return; }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    onDeleted(entry.id);
  };

  const numField = (m, half) => (
    <div key={m.key} style={{ flex: half ? "1 1 45%" : "1 1 100%", minWidth: 120 }}>
      <label style={{ ...caption(), display: "block", marginBottom: 6 }}>{m.label} <span style={{ color: MUTED }}>({m.unit})</span></label>
      <input inputMode="decimal" value={vals[m.key]} placeholder="—"
        onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value }))} style={fieldStyle} />
    </div>
  );

  return (
    <div onClick={onClose} style={overlay(45)}>
      <div onClick={e => e.stopPropagation()} style={{ ...sheet, maxWidth: 540, maxHeight: "90dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>{isNew ? "Nowy pomiar" : "Edytuj pomiar"}</h2>
          <button onClick={onClose} className="press" aria-label="Zamknij" style={iconBtn}>
            <Icon d={P_CLOSE} size={15} color={INK_SOFT} stroke={2.2} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 18px 20px" }}>
          <label style={{ ...caption(), display: "block", marginBottom: 6 }}>Data pomiaru</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldStyle} />

          <h3 style={{ ...sectionLabel(), margin: "22px 0 8px" }}>Waga</h3>
          {numField(BY_KEY.weight, false)}

          <h3 style={{ ...sectionLabel(), margin: "22px 0 8px" }}>Obwody</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {CIRCUMFERENCES.map(k => numField(BY_KEY[k], true))}
          </div>

          <button type="button" onClick={() => setAdvanced(a => !a)} className="press"
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer",
              color: INK_SOFT, fontSize: 13, fontWeight: 600, padding: "22px 0 8px" }}>
            <span style={{ display: "flex", transform: advanced ? "rotate(90deg)" : "none", transition: "transform .15s ease" }}>
              <Icon d={P_CHEVRON} size={14} color={INK_SOFT} />
            </span>
            Zaawansowane (skład ciała)
          </button>
          {advanced && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {ADVANCED.map(k => numField(BY_KEY[k], true))}
            </div>
          )}

          <h3 style={{ ...sectionLabel(), margin: "22px 0 8px" }}>Zdjęcia</h3>
          <div style={{ display: "flex", gap: 10 }}>
            {SLOTS.map(([slot, label]) => (
              <PhotoSlot key={slot} label={label} url={photoUrl(slot)} busy={false}
                onPick={f => pickPhoto(slot, f)} onClear={() => clearPhoto(slot)} />
            ))}
          </div>

          <h3 style={{ ...sectionLabel(), margin: "22px 0 8px" }}>Notatka</h3>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Samopoczucie, trening, cokolwiek warto zapamiętać…"
            style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5, fontSize: 14.5 }} />

          {error && (
            <div style={{ marginTop: 16, background: RED_SOFT, color: RED_DEEP, borderRadius: R_CTRL,
              padding: "11px 13px", fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>{error}</div>
          )}

          <button onClick={save} disabled={busy} className="press"
            style={{ ...primaryBtn, width: "100%", marginTop: 18, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Zapisywanie…" : "Zapisz pomiar"}
          </button>

          {!isNew && (
            confirmDelete ? (
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 13, color: INK_SOFT }}>Usunąć ten wpis wraz ze zdjęciami?</span>
                <button onClick={() => setConfirmDelete(false)} className="press" style={pillBtn(false)}>Anuluj</button>
                <button onClick={remove} disabled={busy} className="press" style={pillBtn(true, RED)}>Usuń</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="press"
                style={{ width: "100%", marginTop: 12, border: `1px solid ${LINE}`, background: CARD, color: RED_DEEP,
                  borderRadius: R_CTRL, padding: "11px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon d={P_TRASH} size={15} color={RED_DEEP} /> Usuń pomiar
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// --- Comparison ----------------------------------------------------------
function Compare({ entries, urls }) {
  const withPhotos = entries;
  const [fromId, setFromId] = useState(() => (withPhotos.length ? withPhotos[withPhotos.length - 1].id : ""));
  const [toId, setToId] = useState(() => (withPhotos.length ? withPhotos[0].id : ""));
  const [sharing, setSharing] = useState("");

  const a = entries.find(e => e.id === fromId);
  const b = entries.find(e => e.id === toId);
  if (!a || !b) {
    return <div style={{ color: MUTED, fontSize: 14, padding: "36px 0", textAlign: "center", lineHeight: 1.6 }}>
      Potrzebne są co najmniej dwa wpisy, żeby je porównać.
    </div>;
  }

  const rows = METRICS.filter(m => a[m.key] !== null && a[m.key] !== undefined && b[m.key] !== null && b[m.key] !== undefined);
  const pairs = SLOTS.filter(([slot]) => a[slot] || b[slot]);
  const days = Math.round((dateOf(b.date) - dateOf(a.date)) / 86400000);

  // Before/after is the thing people actually share, so it goes out as one composed image.
  const share = async () => {
    setSharing("Przygotowuję…");
    try {
      const W = 1080, pairH = 620;
      const rowsH = rows.length * 62 + 40;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = 200 + (pairs.length ? pairH : 0) + rowsH + 40;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = INK;
      ctx.font = "700 56px Inter, sans-serif";
      ctx.fillText("Metamorfoza", 56, 96);
      ctx.fillStyle = MUTED;
      ctx.font = "500 30px Inter, sans-serif";
      ctx.fillText(`${fmtPL(a.date)} → ${fmtPL(b.date)} · ${days} ${plural(days, "dzień", "dni", "dni")}`, 56, 146);

      let y = 200;
      if (pairs.length) {
        const [slot] = pairs[0];
        const half = (W - 56 * 2 - 24) / 2;
        const load = src => new Promise(res => {
          if (!src) return res(null);
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = src;
        });
        const [ia, ib] = await Promise.all([load(urls[a[slot]]), load(urls[b[slot]])]);
        [[ia, 56], [ib, 56 + half + 24]].forEach(([img, x]) => {
          ctx.fillStyle = FILL;
          ctx.fillRect(x, y, half, pairH - 60);
          if (img) {
            const s = Math.max(half / img.width, (pairH - 60) / img.height);
            const dw = img.width * s, dh = img.height * s;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, half, pairH - 60);
            ctx.clip();
            ctx.drawImage(img, x + (half - dw) / 2, y + (pairH - 60 - dh) / 2, dw, dh);
            ctx.restore();
          }
        });
        ctx.fillStyle = INK_SOFT;
        ctx.font = "600 28px Inter, sans-serif";
        ctx.fillText(fmtPL(a.date), 56, y + pairH - 20);
        ctx.fillText(fmtPL(b.date), 56 + half + 24, y + pairH - 20);
        y += pairH;
      }

      y += 20;
      for (const m of rows) {
        const d = b[m.key] - a[m.key];
        const good = m.better === "down" ? d < 0 : d > 0;
        ctx.fillStyle = INK;
        ctx.font = "600 32px Inter, sans-serif";
        ctx.fillText(m.label, 56, y + 34);
        ctx.fillStyle = MUTED;
        ctx.font = "500 32px Inter, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${fmtNum(a[m.key])} → ${fmtNum(b[m.key])} ${m.unit}`, W - 250, y + 34);
        ctx.fillStyle = Math.abs(d) < 0.05 ? MUTED : good ? GREEN_DEEP : RED_DEEP;
        ctx.font = "700 32px Inter, sans-serif";
        ctx.fillText(`${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtNum(Math.abs(d))}`, W - 56, y + 34);
        ctx.textAlign = "left";
        ctx.strokeStyle = LINE;
        ctx.beginPath();
        ctx.moveTo(56, y + 56);
        ctx.lineTo(W - 56, y + 56);
        ctx.stroke();
        y += 62;
      }

      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Nie udało się złożyć obrazka.");
      const file = new File([blob], `metamorfoza-${a.date}-${b.date}.jpg`, { type: "image/jpeg" });

      // Composing the image is async, so the tap that started this may no longer count as a
      // gesture by the time the share sheet is asked for. Treat any failure other than the user
      // cancelling as "no share sheet available" and hand them the file instead.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Metamorfoza" });
          setSharing("");
          return;
        } catch (shareErr) {
          if (shareErr && shareErr.name === "AbortError") { setSharing(""); return; }
          console.warn("Share sheet unavailable, falling back to download.", shareErr);
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setSharing("Pobrano obrazek");
      setTimeout(() => setSharing(""), 2500);
    } catch (e) {
      console.error(e);
      setSharing(e && e.name === "AbortError" ? "" : "Nie udało się udostępnić.");
    }
  };

  const picker = (value, onChange, label) => (
    <div style={{ flex: 1, minWidth: 140 }}>
      <label style={{ ...caption(), display: "block", marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
        {entries.slice().reverse().map(e => <option key={e.id} value={e.id}>{fmtPL(e.date)}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {picker(fromId, setFromId, "Od")}
        {picker(toId, setToId, "Do")}
      </div>

      {pairs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {pairs.map(([slot, label]) => (
            <div key={slot}>
              <div style={{ ...sectionLabel(), marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[a, b].map((entry, i) => (
                  <div key={i} style={{ flex: 1 }}>
                    <div style={{ aspectRatio: "3 / 4", borderRadius: R_CTRL, overflow: "hidden", background: FILL, border: `1px solid ${LINE}` }}>
                      <SafeImg src={urls[entry[slot]]} alt={`${label} ${fmtPL(entry.date)}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                          justifyContent: "center", color: MUTED, fontSize: 12 }}>Brak zdjęcia</div>} />
                    </div>
                    <div style={{ ...caption({ fontSize: 12 }), textAlign: "center", marginTop: 6, ...NUM }}>{fmtPL(entry.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <ul style={{ ...listBox, listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((m, i) => (
            <li key={m.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              borderTop: i ? `1px solid ${LINE}` : "none" }}>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{m.label}</span>
              <span style={{ fontSize: 13.5, color: MUTED, ...NUM }}>{fmtNum(a[m.key])} → <b style={{ color: INK }}>{fmtNum(b[m.key])}</b> {m.unit}</span>
              <Delta metric={m} from={a[m.key]} to={b[m.key]} size="sm" />
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: MUTED, fontSize: 13.5, padding: "18px 0", textAlign: "center", lineHeight: 1.6 }}>
          Te dwa wpisy nie mają wspólnych pomiarów do porównania.
        </div>
      )}

      <button onClick={share} className="press" style={{ ...primaryBtn, width: "100%", marginTop: 18,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon d={P_SHARE} size={17} color="#fff" /> {sharing || "Udostępnij porównanie"}
      </button>
      <p style={{ ...caption({ fontSize: 12 }), margin: "10px 2px 0", lineHeight: 1.5 }}>
        Składa jeden obrazek ze zdjęciami i tabelką różnic — do wysłania albo zapisania.
      </p>
    </div>
  );
}

// --- Tab -----------------------------------------------------------------
export default function Progress({ user }) {
  const [view, setView] = useState("overview");
  const [entries, setEntries] = useState([]);           // newest first
  const [state, setState] = useState("loading");        // loading | ready | error
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [urls, setUrls] = useState({});
  const [metric, setMetric] = useState("weight");
  const [range, setRange] = useState("all");

  const load = useCallback(async () => {
    const { data, error: dbErr } = await supabase
      .from("progress").select("*").eq("user_id", user.id).order("date", { ascending: false });
    if (dbErr) { console.error(dbErr); setError(dbErr.message); setState("error"); return; }
    setEntries(data || []);
    setState("ready");
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // Photos live in a private bucket, so every path needs a signed URL before it can be shown.
  useEffect(() => {
    const paths = [];
    for (const e of entries) for (const [slot] of SLOTS) if (e[slot]) paths.push(e[slot], thumbOf(e[slot]));
    const missing = paths.filter(p => !urls[p]);
    if (!missing.length) return;
    let cancelled = false;
    supabase.storage.from(BUCKET).createSignedUrls(missing, 3600).then(({ data, error: sErr }) => {
      if (cancelled || sErr || !data) { if (sErr) console.error(sErr); return; }
      setUrls(u => {
        const next = { ...u };
        data.forEach(d => { if (d.signedUrl && !d.error) next[d.path] = d.signedUrl; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [entries, urls]);

  const latest = entries[0];
  const previous = entries[1];

  const series = useMemo(() => {
    const cut = RANGE_DAYS[range] ? Date.now() - RANGE_DAYS[range] * 86400000 : -Infinity;
    return entries
      .filter(e => e[metric] !== null && e[metric] !== undefined && dateOf(e.date).getTime() >= cut)
      .map(e => ({ k: e.date, x: dateOf(e.date).getTime(), y: Number(e[metric]) }))
      .sort((p, q) => p.x - q.x);
  }, [entries, metric, range]);

  const weightSeries = useMemo(() => entries
    .filter(e => e.weight !== null && e.weight !== undefined)
    .map(e => ({ k: e.date, x: dateOf(e.date).getTime(), y: Number(e.weight) }))
    .sort((p, q) => p.x - q.x), [entries]);

  const onSaved = saved => {
    setEntries(list => [...list.filter(e => e.id !== saved.id), saved].sort((a, b) => (a.date < b.date ? 1 : -1)));
    setUrls(u => {                                        // drop stale signed URLs for replaced photos
      const next = { ...u };
      for (const [slot] of SLOTS) if (saved[slot]) { delete next[saved[slot]]; delete next[thumbOf(saved[slot])]; }
      return next;
    });
    setEditing(null);
  };
  const onDeleted = id => { setEntries(list => list.filter(e => e.id !== id)); setEditing(null); };

  if (state === "loading") return <div style={{ color: MUTED, fontSize: 14, padding: "8px 2px" }}>Wczytywanie postępów…</div>;

  if (state === "error") {
    const missingTable = /relation .* does not exist|schema cache/i.test(error);
    return (
      <section style={{ ...cardStyle, maxWidth: 560, margin: "0 auto", padding: 22 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px", letterSpacing: -0.4 }}>Nie udało się wczytać postępów</h2>
        <p style={{ fontSize: 14, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 18px" }}>
          {missingTable
            ? "Wygląda na to, że w Supabase nie ma jeszcze tabeli „progress”. Uruchom supabase/schema.sql w SQL Editorze projektu."
            : error}
        </p>
        <button onClick={() => { setState("loading"); load(); }} className="press" style={primaryBtn}>Spróbuj ponownie</button>
      </section>
    );
  }

  const summaryOf = e => {
    const parts = METRICS.filter(m => e[m.key] !== null && e[m.key] !== undefined)
      .map(m => `${m.short} ${fmtNum(e[m.key])}${m.unit === "%" ? "%" : ""}`);
    return parts.length ? parts.join(" · ") : "Tylko zdjęcia";
  };

  return (
    <div style={{ maxWidth: 660, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Segmented value={view} onChange={setView}
          options={[["overview", "Przegląd"], ["charts", "Wykresy"], ["compare", "Metamorfoza"]]} />
      </div>

      {!entries.length ? (
        <section style={{ ...cardStyle, textAlign: "center", padding: "40px 22px" }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: GREEN_SOFT, color: GREEN_DEEP,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon d={P_PLUS} size={24} color={GREEN_DEEP} stroke={2.2} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", letterSpacing: -0.4 }}>Zacznij śledzić postępy</h2>
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: "0 0 20px" }}>
            Dodaj pierwszy pomiar — wagę, obwody, zdjęcia. Nie musisz wypełniać wszystkiego naraz.
          </p>
          <button onClick={() => setEditing({})} className="press" style={primaryBtn}>Dodaj pomiar</button>
        </section>
      ) : view === "overview" ? (
        <>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={sectionLabel()}>Ostatni pomiar</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, ...NUM }}>{fmtPL(latest.date)}</div>
              </div>
              <button onClick={() => setEditing(latest)} className="press" aria-label="Edytuj" style={iconBtn}>
                <Icon d={P_EDIT} size={15} color={INK_SOFT} />
              </button>
            </div>

            {latest.weight !== null && latest.weight !== undefined && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.2, ...NUM }}>{fmtNum(latest.weight)}</span>
                <span style={{ fontSize: 15, color: MUTED, fontWeight: 500 }}>kg</span>
                {previous && previous.weight !== null && previous.weight !== undefined && (
                  <Delta metric={BY_KEY.weight} from={Number(previous.weight)} to={Number(latest.weight)} />
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {METRICS.filter(m => m.key !== "weight" && latest[m.key] !== null && latest[m.key] !== undefined).map(m => (
                <span key={m.key} style={{ background: FILL, borderRadius: R_PILL, padding: "6px 12px", fontSize: 13, fontWeight: 600, ...NUM }}>
                  <span style={{ color: MUTED, fontWeight: 500 }}>{m.short} </span>{fmtNum(latest[m.key])} {m.unit}
                </span>
              ))}
            </div>

            {latest.note && (
              <div style={{ marginTop: 14, background: FILL, borderRadius: R_CTRL, padding: "11px 13px",
                fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55 }}>{latest.note}</div>
            )}

            {weightSeries.length > 1 && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
                <div style={{ ...caption({ fontSize: 12 }), marginBottom: 4 }}>Trend wagi</div>
                <Chart points={weightSeries} color={GREEN} height={64} compact unit="kg" />
              </div>
            )}
          </section>

          <div style={{ ...sectionLabel(), padding: "0 4px 8px" }}>
            Historia · {entries.length} {plural(entries.length, "wpis", "wpisy", "wpisów")}
          </div>
          <ul style={{ ...listBox, listStyle: "none", padding: 0, margin: 0, background: CARD }}>
            {entries.map((e, i) => (
              <li key={e.id} style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}>
                <button onClick={() => setEditing(e)} className="press row" style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                  border: "none", background: "transparent", cursor: "pointer", padding: "10px 12px"
                }}>
                  <div style={{ width: 48, height: 60, borderRadius: 10, overflow: "hidden", background: FILL,
                    flexShrink: 0, border: `1px solid ${LINE}` }}>
                    <SafeImg src={urls[thumbOf(e.photo_front)] || urls[thumbOf(e.photo_side)] || urls[thumbOf(e.photo_back)]}
                      alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                        justifyContent: "center", color: MUTED }}><Icon d={P_CAMERA} size={16} color={MUTED} /></div>} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, ...NUM }}>{fmtPL(e.date)}</div>
                    <div className="ellip" style={{ fontSize: 12.5, color: MUTED, marginTop: 3, ...NUM }}>{summaryOf(e)}</div>
                  </div>
                  <Icon d={P_CHEVRON} size={18} color={MUTED} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : view === "charts" ? (
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Segmented size="sm" value={metric} onChange={setMetric} options={METRICS.map(m => [m.key, m.short])} />
          </div>
          <Chart points={series} color={BY_KEY[metric].color} unit={BY_KEY[metric].unit} />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <Segmented size="sm" value={range} onChange={setRange} options={RANGES} />
          </div>
          {series.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
              <span style={{ fontSize: 13.5, color: INK_SOFT, ...NUM }}>
                {fmtNum(series[0].y)} → <b style={{ color: INK }}>{fmtNum(series[series.length - 1].y)}</b> {BY_KEY[metric].unit}
              </span>
              <Delta metric={BY_KEY[metric]} from={series[0].y} to={series[series.length - 1].y} />
            </div>
          )}
          {series.length <= 1 && (
            <p style={{ ...caption({ fontSize: 12.5 }), textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>
              Potrzebne są co najmniej dwa pomiary tej metryki w wybranym zakresie, żeby zobaczyć trend.
            </p>
          )}
        </section>
      ) : (
        <section style={cardStyle}><Compare entries={entries} urls={urls} /></section>
      )}

      {entries.length > 0 && (
        <button onClick={() => setEditing({})} className="press" aria-label="Dodaj pomiar" title="Dodaj pomiar"
          style={{
            position: "fixed", right: 20, bottom: "calc(24px + env(safe-area-inset-bottom))", zIndex: 20,
            width: 56, height: 56, borderRadius: R_PILL, border: "none", background: GREEN, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(52,199,89,.42)"
          }}>
          <Icon d={P_PLUS} size={26} color="#fff" stroke={2.4} />
        </button>
      )}

      {editing && (
        <EntryEditor user={user} entry={editing} taken={entries} urls={urls}
          onSaved={onSaved} onDeleted={onDeleted} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
