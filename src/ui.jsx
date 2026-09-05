import { useState } from "react";

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
export function SafeImg({ src, alt = "", style, fallback = null, ...rest }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback;
  return <img src={src} alt={alt} onError={() => setErr(true)} style={style} {...rest} />;
}
