import { useState, useEffect, useRef } from "react";

// --- Design tokens -------------------------------------------------------
// Calm iOS-flavoured surface: near-white app background, white cards with soft shadows and
// generous radii, hairline separators instead of borders, one typeface throughout (numerals in
// tabular figures so they stop jittering), and a single light-green accent carrying progress,
// selection and primary actions. Shared by App.jsx and Progress.jsx.
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export const GREEN = "#34C759";        // the accent: fills, rings, active states
export const GREEN_DEEP = "#1B8A3C";   // the same accent where it has to read as text on white
export const GREEN_SOFT = "#E9F9EE";   // tinted surface behind accent content
export const GREEN_GLOW = "0 6px 18px rgba(52,199,89,.30)";

export const BG = "#F4F4F7";           // app background behind the cards
export const CARD = "#FFFFFF";
export const INK = "#1C1C1E";          // primary text
export const INK_SOFT = "#55555C";     // secondary text
export const MUTED = "#8E8E93";        // captions, tertiary text
export const LINE = "#EAEAEF";         // hairline separators and control outlines
export const FILL = "#F2F2F6";         // inset control fill: search field, segmented track

export const AMBER = "#FF9F0A", AMBER_SOFT = "#FFF3E0", AMBER_DEEP = "#A05C00";
export const RED = "#FF3B30", RED_SOFT = "#FFECEA", RED_DEEP = "#C0261C";
export const BLUE = "#5E5CE6", TEAL = "#30B0C7", PINK = "#FF375F";

export const R_CARD = 20, R_CTRL = 14, R_PILL = 999;
export const SHADOW = "0 1px 2px rgba(16,24,40,.04), 0 12px 32px rgba(16,24,40,.06)";
export const SHADOW_SM = "0 1px 3px rgba(16,24,40,.06), 0 6px 16px rgba(16,24,40,.05)";
export const NUM = { fontVariantNumeric: "tabular-nums" };

// --- Dates ---------------------------------------------------------------
export const MONTHS = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
// Polish declines the month in a date: "5 września", not "5 wrzesień".
export const MONTHS_GEN = ["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];
export const MONTHS_SHORT = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];
export const DOW = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];
export const DOW_LONG = ["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];

export const pad = n => String(n).padStart(2, "0");
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const fmtPL = k => { const [y,m,d] = k.split("-"); return `${parseInt(d)} ${MONTHS_GEN[parseInt(m)-1]} ${y}`; };
export const fmtShort = k => { const [, m, d] = k.split("-"); return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m)-1]}`; };
export const dowOf = k => { const [y,m,d] = k.split("-").map(Number); return DOW_LONG[(new Date(y, m-1, d).getDay() + 6) % 7]; };
// Local noon keeps the date stable across DST shifts.
export const dateOf = k => new Date(k + "T12:00:00");

// Polish writes decimals with a comma; accept either on input, always render a comma.
export const fmtNum = v => (v === null || v === undefined || v === "" ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));
export const parseNum = raw => {
  const t = String(raw).trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

// Polish counts decline three ways: 1 dzień, 2-4 dni, 5 dni - and the teens fall back to "many".
export const plural = (n, one, few, many) => {
  const t = n % 10, h = n % 100;
  return n === 1 ? one : t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many;
};

// --- Shared building blocks ---------------------------------------------
export const caption = (extra = {}) => ({ fontSize: 12.5, fontWeight: 500, color: MUTED, ...extra });
export const sectionLabel = (extra = {}) => ({
  fontSize: 11.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: MUTED, ...extra
});

export const cardStyle = { background: CARD, borderRadius: R_CARD, boxShadow: SHADOW, padding: 18 };
export const listBox = { border: `1px solid ${LINE}`, borderRadius: R_CTRL, overflow: "hidden" };
export const iconBtn = {
  width: 32, height: 32, borderRadius: R_PILL, border: "none", background: FILL, padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0
};
export const pillBtn = (active, tone = GREEN) => ({
  border: `1px solid ${active ? tone : LINE}`, background: active ? tone : CARD,
  color: active ? "#fff" : INK_SOFT, borderRadius: R_PILL, padding: "6px 12px",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", ...NUM
});
export const primaryBtn = {
  background: GREEN, color: "#fff", border: "none", borderRadius: R_CTRL,
  padding: "14px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: GREEN_GLOW
};
export const fieldStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: R_CTRL,
  border: `1px solid ${LINE}`, background: FILL, fontSize: 15, fontWeight: 500, color: INK, ...NUM
};
export const overlay = z => ({
  position: "fixed", inset: 0, background: "rgba(28,28,30,.38)",
  backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: z,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))"
});
export const sheet = { background: CARD, borderRadius: R_CARD, boxShadow: "0 24px 64px rgba(16,24,40,.24)", width: "100%" };

// A segmented control in the iOS mould: grey track, white pill on the active segment.
export function Segmented({ options, value, onChange, size = "md" }) {
  const s = size === "sm";
  return (
    <div style={{ display: "inline-flex", gap: 3, background: FILL, borderRadius: R_PILL, padding: 3, maxWidth: "100%", overflowX: "auto" }}>
      {options.map(([id, lbl]) => (
        <button key={id} onClick={() => onChange(id)} className="press" style={{
          border: "none", cursor: "pointer", padding: s ? "5px 11px" : "7px 16px",
          fontSize: s ? 12.5 : 13.5, fontWeight: 600, borderRadius: R_PILL, whiteSpace: "nowrap",
          background: value === id ? CARD : "transparent", color: value === id ? INK : INK_SOFT,
          boxShadow: value === id ? SHADOW_SM : "none"
        }}>{lbl}</button>
      ))}
    </div>
  );
}

// --- Icons ---------------------------------------------------------------
// One stroked-path set, so nothing here depends on an icon font or a decorative emoji.
export const P_CHEVRON = "M9 6l6 6-6 6";
export const P_BACK = "M15 6l-6 6 6 6";
export const P_CLOSE = "M6 6l12 12M18 6L6 18";
export const P_CHECK = "M4.5 12.5l5 5 10-11";
export const P_PLUS = "M12 5v14M5 12h14";
export const P_SEARCH = "M11 4a7 7 0 100 14 7 7 0 000-14zM20.5 20.5l-4.3-4.3";
export const P_CAMERA = "M4 8.5A1.5 1.5 0 015.5 7h2L9 5h6l1.5 2h2A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9zM12 15.5a3 3 0 100-6 3 3 0 000 6z";
export const P_TRASH = "M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12M10.5 10.5v5M13.5 10.5v5";
export const P_SHARE = "M12 15V4M8.5 7.5L12 4l3.5 3.5M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13";
export const P_EDIT = "M4 20h4L19 9a2.1 2.1 0 10-3-3L5 17v3zM14.5 7.5l3 3";
export const P_BOOKMARK = "M6.5 4h11a1 1 0 011 1v15l-6.5-4-6.5 4V5a1 1 0 011-1z";
export const P_SKIP = "M12 4a8 8 0 100 16 8 8 0 000-16zM6.5 6.5l11 11";
export const P_SLIDERS = "M4 8h7M15 8h5M4 16h3M11 16h9M13 5.5v5M9 13.5v5";
export const P_ARROW_DOWN = "M12 5v14M6.5 12.5L12 19l5.5-6.5";
export const P_ARROW_UP = "M12 19V5M6.5 11.5L12 5l5.5 6.5";
export const P_MINUS = "M6 12h12";

export const Icon = ({ d, size = 16, color = "currentColor", stroke = 1.9 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }} aria-hidden="true">
    <path d={d} />
  </svg>
);

// --- Image that falls back to a tinted placeholder ----------------------
export function SafeImg({ src, alt = "", style, fallback = null, onFail, ...rest }) {
  const [failed, setFailed] = useState(null);
  const err = failed === src;                   // a new src gets a fresh chance on its own
  if (!src || err) return fallback;
  return <img src={src} alt={alt} style={style}
    onError={() => { setFailed(src); if (onFail) onFail(src); }} {...rest} />;
}

// Swipe-to-delete on a list row, the iOS way: drag left to reveal a red action behind the row.
// Deliberately gesture-first but never gesture-only — the action is a real focusable <button>, so
// Tab reaches it (and focusing slides the row open), and the existing delete buttons inside the
// picker and the quick-entry sheet keep working untouched.
const SWIPE_W = 88;

export function SwipeRow({ children, onDelete, label = "Usuń", disabled = false, collapsing = false, background = CARD }) {
  const [offset, setOffset] = useState(0);   // current x translation, -SWIPE_W when fully open
  const [open, setOpen] = useState(false);
  const drag = useRef(null);
  const dragged = useRef(false);

  const settle = next => { setOpen(next); setOffset(next ? -SWIPE_W : 0); };

  const onPointerDown = e => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, axis: null, base: open ? -SWIPE_W : 0 };
    dragged.current = false;
  };

  const onPointerMove = e => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Let the browser keep vertical scrolling; only take over on a clearly horizontal drag.
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== "x") return;
    dragged.current = true;
    setOffset(Math.max(-SWIPE_W, Math.min(0, d.base + dx)));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    settle(offset < -SWIPE_W / 2);
  };

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      maxHeight: collapsing ? 0 : 400, opacity: collapsing ? 0 : 1,
      transition: collapsing ? "max-height .22s ease, opacity .16s ease" : "none"
    }}>
      <button type="button" onClick={() => { settle(false); onDelete(); }} onFocus={() => settle(true)}
        disabled={disabled} aria-label={label}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: SWIPE_W, border: "none",
          background: RED, color: "#fff", cursor: "pointer", display: disabled ? "none" : "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          fontSize: 12, fontWeight: 600
        }}>
        <Icon d={P_TRASH} size={17} color="#fff" />
        {label}
      </button>
      <div
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onClickCapture={e => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } }}
        style={{
          position: "relative", background, touchAction: "pan-y",
          transform: `translateX(${offset}px)`,
          transition: drag.current ? "none" : "transform .2s cubic-bezier(.2,.8,.3,1)"
        }}>
        {children}
      </div>
    </div>
  );
}

// A short-lived "undone in one tap" bar. Preferred over a confirmation dialog: deleting a meal is
// a frequent, cheap action, and a modal in front of every one of them gets old fast.
export function UndoToast({ message, onUndo, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [message, onDismiss]);
  return (
    <div role="status" style={{
      position: "fixed", left: "50%", transform: "translateX(-50%)",
      bottom: "calc(20px + env(safe-area-inset-bottom))", zIndex: 60,
      display: "flex", alignItems: "center", gap: 14, maxWidth: "calc(100vw - 32px)",
      background: INK, color: "#fff", borderRadius: R_PILL, padding: "11px 12px 11px 18px",
      boxShadow: "0 12px 32px rgba(16,24,40,.28)", fontSize: 14, fontWeight: 500
    }}>
      <span className="ellip">{message}</span>
      <button onClick={onUndo} className="press" style={{
        border: "none", background: "rgba(255,255,255,.16)", color: "#fff", borderRadius: R_PILL,
        padding: "6px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", flexShrink: 0
      }}>Cofnij</button>
    </div>
  );
}
