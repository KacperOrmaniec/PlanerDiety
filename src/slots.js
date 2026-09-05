// Which meal slots a recipe may be served in.
//
// `RECIPES` gives every recipe exactly one `cat`, but that is a label from the spreadsheet — it
// says which meal of a designed day the recipe appeared in, not the only place it makes sense.
// The base mixes the two ends of the day on purpose (18 of the 70 "Kolacja" recipes are owsianki),
// so "what may be picked here" is kept apart from "where the spreadsheet filed it", and is
// maintained by hand.
//
// This file is SOURCE, not a build artifact: unlike `data/recipes.js` it is never regenerated,
// so edits here survive a new export from the Excel base. Rules match on the recipe NAME rather
// than its id, because ids are positional and shift when the base is regenerated, while names stay.
//
// Default: a recipe may be served where the base filed it (`[r.cat]`) — i.e. nothing changes until
// a rule or an override says otherwise. Rules can narrow (owsianki → breakfast only) or widen
// (a recipe offered in two slots) the list.

import { RECIPES } from "./data/recipes.js";

export const CATS = ["Śniadanie", "Obiad", "Kolacja", "Przekąska"];

// First matching rule wins.
export const SLOT_RULES = [
  {
    id: "owsianki",
    label: "Owsianki i jaglanki",
    why: "Porridge is breakfast food; the base files 18 of them under Kolacja.",
    // Matches the noun ("owsianka/owsianki/owsiankę/owsianką", "nocna owsianka", "jaglanka") and
    // deliberately NOT the adjective "owsiany/owsiana/owsiane" — "Bułka owsiana z łososiem" and
    // "Mintaj w płatkach owsianych" are not porridge and stay where they are.
    test: /owsiank|owsianc|jaglank/i,
    slots: ["Śniadanie"],
  },
];

// Per-recipe exceptions, applied before the rules: recipe id → allowed slots. Widens as readily as
// it narrows, e.g. 163: ["Śniadanie", "Kolacja"] offers "Bułka owsiana z łososiem" at both ends of
// the day, and 5: ["Śniadanie", "Przekąska"] would let one porridge through as a snack.
// Keyed by id, so re-check these after `data/recipes.js` is regenerated.
export const SLOT_OVERRIDES = {};

const isCat = c => CATS.includes(c);

// Allowed slots for one recipe, always in CATS order and never empty (an override or rule that
// leaves nothing valid falls back to the recipe's own category, so no recipe can vanish from
// every picker and no draw pool can end up empty).
export function slotsOf(r) {
  if (!r) return [];
  const rule = SLOT_OVERRIDES[r.id] || SLOT_RULES.find(x => x.test.test(r.name))?.slots;
  const slots = CATS.filter(c => (rule || [r.cat]).includes(c));
  return slots.length ? slots : [r.cat];
}

// Resolved once at load: recipe id → allowed slots, and slot → the recipes allowed in it.
export const SLOTS_BY_ID = {};
export const SLOT_POOLS = Object.fromEntries(CATS.map(c => [c, []]));
for (const r of RECIPES) {
  const slots = slotsOf(r);
  SLOTS_BY_ID[r.id] = slots;
  for (const c of slots) SLOT_POOLS[c].push(r);
}

// A slot with nothing in it would break "Wylosuj dzień" (it draws one recipe per slot), so a rule
// that empties one is treated as a mistake and that slot falls back to the base's own filing.
for (const c of CATS) {
  if (!SLOT_POOLS[c].length) {
    console.warn(`[slots] Reguły nie zostawiły żadnego przepisu na "${c}" — używam kategorii z bazy.`);
    SLOT_POOLS[c] = RECIPES.filter(r => r.cat === c);
    for (const r of SLOT_POOLS[c]) if (!SLOTS_BY_ID[r.id].includes(c)) SLOTS_BY_ID[r.id] = slotsOf(r).concat(c);
  }
}

export const slotsOfId = id => SLOTS_BY_ID[id] || [];
export const allowedIn = (r, cat) => !!r && (SLOTS_BY_ID[r.id] || slotsOf(r)).includes(cat);

// The slot a recipe reads as when it has to be shown as one thing (thumbnail placeholder, hero
// tint). Its own `cat` when that is still allowed, otherwise the first slot that is — so an
// owsianka filed under Kolacja never shows a "Kolacja" badge it can no longer be picked for.
export function primarySlot(r) {
  const slots = SLOTS_BY_ID[r.id] || slotsOf(r);
  return slots.includes(r.cat) ? r.cat : slots[0] || r.cat;
}
