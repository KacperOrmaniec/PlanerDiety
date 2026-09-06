# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Planer diety" — a Polish-language meal planning PWA (calendar + shopping list). React 18 + Vite 5,
no custom backend and no build step beyond Vite: the entire recipe database is baked into static JS
files at build time, and per-user state (the plan itself) is persisted in Supabase (Postgres + Auth)
rather than a hand-written API server — the frontend talks to Supabase directly.

## Commands

```bash
npm install      # install deps
npm run dev      # dev server at http://localhost:5173, hot reload
npm run build    # production build to dist/
npm run preview  # serve the dist/ build locally to sanity-check before deploying
```

There is no lint or test setup in this repo (no ESLint config, no test runner). The closest thing to
verification is `npm run build` succeeding and manually exercising the app in a browser. The build
currently emits one ~730 kB JS chunk (~193 kB gzip) and warns about the 500 kB chunk limit — that
warning is expected, not a regression (see "Known issues").

Requires a `.env.local` (gitignored, see `.env.example`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` for a Supabase project that has run `supabase/schema.sql` — which now
creates the `plans` table (including its `extras` and `favorites` columns), the `progress` table and
the private `progress-photos` storage bucket, and is safe to re-run (every statement is guarded).
Re-run it after pulling a change that adds a column. Without them the
app does not crash: `supabaseClient.js` exports `supabaseConfigured = false` (and `supabase = null`),
and `Root.jsx` renders a Polish "Brak konfiguracji Supabase" card instead of the auth screen.
`PEXELS_API_KEY` in the same file is used only by `scripts/fetch-recipe-photos.mjs` (Node, never
bundled).

## Architecture

**The app is three tabs across three files**, with no router, no component library and no CSS files:

- `src/App.jsx` (~1330 lines) — the shell (header, tab switch) plus the two meal-planning tabs:
  calendar grid, day panel, `PickerModal`, `RecipeModal`, `QuickEntryModal`, shopping list, and the
  Supabase sync layer.
- `src/Progress.jsx` (~830 lines) — the "Postępy" tab in full (see below). Split out rather than
  bolted onto `App.jsx` purely for size; it follows the same conventions.
- `src/ui.jsx` — the design tokens, date helpers and the pieces both tabs import: `Segmented`,
  `SwipeRow`, `UndoToast`, `Icon` with its `P_*` paths, and the number/plural formatters. Anything
  used by more than one tab belongs here.
- `src/Settings.jsx` — the "Dostosuj dietę" sheet: switching individual recipes off (see "Hiding
  recipes" below). Split out for size like `Progress.jsx`, same conventions.
- `src/slots.js` — `CATS` (the four meal slots) and the rules deciding which recipe may be served in
  which of them (see "Allowed meal slots" below).
- `src/diets.js` — `DIET_GROUPS` / `GROUP_OF`, derived from `RECIPES` at module load. Lifted out of
  `App.jsx` so `Settings.jsx` can label a recipe's plan without importing from `App`, which imports
  `Settings` back.

Styling is inline `style={}` objects throughout, on a calm iOS-flavoured system defined as constants
in `src/ui.jsx`. Match it rather than introducing a CSS/styling system:

- **One typeface.** `FONT` is Inter (loaded in `index.html`) over the native `-apple-system` stack, so
  Apple devices get real SF Pro. There is no second family — numbers use `NUM`
  (`font-variant-numeric: tabular-nums`) instead of a monospace font, which is what keeps counters and
  kcal figures from jittering as they change.
- **Surfaces.** `BG` (#F4F4F7) behind `CARD` (white) panels: `cardStyle` = radius `R_CARD` (20) plus
  the soft `SHADOW`. Inset lists use `listBox` — a `LINE` hairline, radius `R_CTRL` (14), and rows
  separated by `borderTop` hairlines rather than boxed borders. `FILL` is the inset control fill
  (search field, segmented track, progress track). Radii: `R_CARD` / `R_CTRL` / `R_PILL` (999).
- **The accent is light green.** `GREEN` (#34C759) fills the primary button, the selected calendar
  day, active pills and the progress bar; `GREEN_DEEP` is the same accent where it must read as text
  on white (`GREEN` alone fails contrast); `GREEN_SOFT` is the tinted surface behind accent content.
  `AMBER` and `RED` come with matching `_SOFT`/`_DEEP` pairs and are used only for over/under-target
  states and warnings.
- **Category colours avoid green on purpose** (`CAT_COLORS`: amber / teal / indigo / pink), so a
  coloured dot on a calendar cell never reads as "on target". `CAT_TINT` carries the soft
  background + readable foreground pair used for category pills; `MACROS` does the same for B/T/W.
- **Shared pieces**: `caption()` and `sectionLabel()` for the two label sizes, `pillBtn(active)` for
  chips, `iconBtn` for round icon buttons, `overlay(z)` + `sheet` for modals, and `Icon` with the
  `P_*` path constants — one stroked SVG set, so nothing depends on an icon font or a decorative
  emoji. Interactive surfaces take `className="press"` (scale on tap) and list rows `className="row"`
  (hover tint); `clamp2` / `ellip` keep list rows a steady height.
- The only non-inline CSS is one `<style>` block each in `App.jsx` and `Auth.jsx` (focus rings, the
  press/hover transitions, the truncation helpers, and the single `.split` media query that collapses
  the calendar's two columns under 880px).

Polish text goes through `plural(n, one, few, many)` for anything counted, and dates through
`fmtPL` (genitive month: "5 września", not "5 wrzesień") plus `dowOf` for the weekday line.

`src/main.jsx` mounts `<Root />` (not `<App />` directly) and registers the service worker
(production only). `src/Root.jsx` is the auth gate: it checks `supabase.auth.getSession()` and
subscribes to `onAuthStateChange`, rendering `<Auth />` (`src/Auth.jsx`, email/password sign-in and
sign-up) when signed out, or `<App session={session} />` when signed in. `App` receives the Supabase
session as a prop and reads `session.user.id`/`session.user.email` — it is not designed to render
without one.

### Data layer (`src/data/`)

Three generated, machine-written JS files — treat them as build artifacts, not hand-edited source.
Together they are ~340 kB of source that ships eagerly in the main bundle:

- `recipes.js` — exports `RECIPES`, an array of 280 recipe objects, ids 1..280 with no gaps. Shape:
  `{ id, diet, day, cat, name, kcal, p, f, c, port, time, ing: [{ n, d, g }], note, img }`
  (`diet`/`day` place a recipe within one of 5 named meal plans "Dieta 1"–"Dieta 5" — the UI never
  shows those names, see "Meal plans by calorie level" below; `cat` is one of
  `Śniadanie`/`Obiad`/`Kolacja`/`Przekąska`, 70 recipes each; `port` ∈ {1,2,4,5} — 269 of the 280
  are `port: 1`; `ing[].g` is grams and all shopping-list math runs on it, while `ing[].d` is the
  same amount as the recipe writes it, either a bare `"60 g"` or a household measure with the grams
  in brackets, `"4 sztuki (224 g)"` — every one of the 2229 ingredient rows takes one of those two
  shapes and the bracketed figure always equals `ing[].g`, which is what makes `d` safe to parse
  (see `houseMeasure`); `img` is an optional explicit photo URL — currently no recipe sets it).
- `categories.js` — exports `ING_CAT`, a map of normalized ingredient name → shopping category
  (`Warzywa`, `Nabiał i jajka`, etc.), used to group the shopping list. It has 305 entries covering
  every `aggKey(...)` value `RECIPES` produces except `"woda"`, which falls through to `Inne` (as do
  `"odżywka białkowa"` and `"ciasto do naleśników low fodmap"`, mapped there explicitly).
  Its header comment lists the **manual corrections** made on top of the generated data — fresh herbs
  and root aromatics (bazylia, kolendra, koper, mięta, natka pietruszki, szczypiorek, tymianek,
  imbir) moved out of `Warzywa` into `Przyprawy`, so they sit beside their dried counterparts on the
  shopping list. Re-apply them after any regeneration from the spreadsheet; `czosnek`,
  `papryczka chilli` and `cebula dymka` are deliberately left in `Warzywa`.
- `instructions.js` — exports `STEPS`, a map of recipe `id` (string key) → newline-separated prep
  instructions. All 280 recipes have steps.

**Source of truth is an Excel file** (`Baza_posilkow_z_kategoriami.xlsx`, not checked into the repo),
not these JS files. Per `README.md`, the intended regeneration workflow when the spreadsheet changes
is: upload the Excel to Claude and ask it to regenerate `recipes.js`/`categories.js` to match the
schema above, then replace the files — there is no build script that does this automatically.

**Regenerating `recipes.js` is a breaking data migration.** Saved plans in Supabase store bare
numeric recipe ids, and ids here are positional. If a regeneration renumbers recipes, every existing
user's plan silently points at *different meals*; if it removes ids, `byId[...]` is `undefined` and
those meals vanish from the day panel and the shopping list while the calendar still draws a colored
dot for them (`App.jsx:776` checks `plan[k][cat]` truthiness, not `byId`). Keep ids stable across
regenerations, or plan an explicit migration of the `plans.plan` JSONB.

After regenerating, re-run the photo pipeline (below) so `public/recipes/<id>.jpg` still lines up.

### Meal plans by calorie level

`recipes.js` labels every recipe with a `diet` ("Dieta 1"–"Dieta 5") and a `day`, and each
`(diet, day)` pair is a designed day of exactly 4 meals — 70 such days in total. Those names mean
nothing to a user, so `App.jsx` derives `DIET_GROUPS` from the data instead: it averages each diet's
14 designed-day totals, clusters diets whose averages sit within `GROUP_TOL` (100 kcal) of *each
other* — compared against the lightest member, so a group never chains across a wider span — and
labels each cluster with its rounded average. In the current base that yields two groups:

| Group | Diets | Average day |
|---|---|---|
| `2400 kcal` | Dieta 1–4 | 2397–2410 kcal |
| `2700 kcal` | Dieta 5 | 2699 kcal |

`GROUP_OF` maps a recipe's `diet` to its group object (`{ kcal, label, diets }`). The picker's filter
chips are these groups under a "Plan" caption — the caption matters, because the list below is
already bucketed by each meal's own kcal (`~700 kcal` headers) and bare "2400 kcal" chips would read
as a filter on that. A recipe shows `plan 2400` in the compact list row and `plan 2400 kcal, dz. 7`
in its modal; a recipe with no `diet` falls back to "własny"/"przepis własny".

All of it is derived at module load, so regenerating `recipes.js` with different diets or calorie
levels re-groups the UI automatically — nothing here hardcodes "Dieta N" or a kcal number.

### Allowed meal slots (`src/slots.js`)

A recipe's `cat` is where the **spreadsheet filed it**, not the only slot it belongs in. The base
mixes the two ends of the day deliberately — breakfast-shaped dishes sit in `Kolacja` and vice
versa — so "what may be picked in this slot" is a separate, hand-maintained decision. `slots.js`
holds it, and unlike `data/*.js` it is **source, never regenerated**: edits survive a new export
from the Excel base.

- `slotsOf(r)` resolves a recipe to its allowed slots, always in `CATS` order and never empty:
  `SLOT_OVERRIDES[r.id]` first, then the first matching entry in `SLOT_RULES`, else `[r.cat]` —
  so the default is "exactly where the base filed it" and nothing changes until a rule says so.
  Rules can narrow *or* widen; an override or rule leaving nothing valid falls back to `[r.cat]`.
- **Rules match on the recipe name, not its id**, because ids are positional and shift when
  `recipes.js` is regenerated while names stay. `SLOT_OVERRIDES` is keyed by id precisely because
  it is the escape hatch for one-offs — re-check it after a regeneration.
- `SLOTS_BY_ID` and `SLOT_POOLS` (slot → recipes) are resolved once at load. `PickerModal` lists
  `SLOT_POOLS[cat]` and `POOLS` (the "Wylosuj dzień" draw) is built from it, so both agree by
  construction. If a rule ever emptied a slot the draw would break on `Math.min(...[])`, so an
  empty pool falls back to the base's own filing and warns.
- Display follows the slots, not `cat`: `primarySlot(r)` drives the thumbnail placeholder and the
  hero tint, and `RecipeModal` badges **every** allowed slot (one pill each). A recipe whose slots
  are just `[r.cat]` — 266 of the 280 — looks exactly as it did before.
- A meal already planned in a slot the rules no longer allow **stays listed** in that slot's picker
  (`planned` in `PickerModal`) and keeps rendering in the day panel. Narrowing a rule never silently
  empties somebody's saved plan; it only stops the recipe being offered there again.

The one rule shipped today is `owsianki`: `/owsiank|owsianc|jaglank/i` → `["Śniadanie"]`, which moves
14 porridges out of `Kolacja` (pools become Śniadanie 84 / Obiad 70 / Kolacja 56 / Przekąska 70).
It matches the noun only — "Bułka owsiana z łososiem" and "Mintaj w płatkach owsianych" are not
porridge and stay put.

### Recipe photos

`RecipeThumb`/`RecipeModal` in `App.jsx` resolve an image as `r.img || \`recipes/${r.id}.jpg\``, i.e.
falling back to a local file at `public/recipes/<id>.jpg`. On load error `RecipeThumb` silently swaps
to a colored category-initial placeholder and `RecipeModal` hides the hero image (`onError`
handlers). All 280 photos are present, all byte-distinct, ~23 MB total — sourced from the Pexels API
via three scripts in `scripts/`:

1. `generate-photo-queries.mjs` — classifies each recipe's Polish `name` against an ordered list of
   regexes to produce a short English search query (e.g. "oatmeal bowl with fruit"), writing one row
   per recipe to `photo-queries.csv` (gitignored). Recipes with no matching rule fall back to
   `"polish home cooked meal"` — currently zero do, but only **43 distinct queries** cover all 280
   recipes (44 recipes share "open sandwich rye bread"), so photos match the dish *family*, not the
   specific recipe.
2. `fetch-recipe-photos.mjs` — reads `photo-queries.csv`, does one Pexels search per *unique* query,
   then round-robins a distinct photo from that query's result pool to each recipe using it,
   downloading to `public/recipes/<id>.jpg`. This is what gives every recipe its own photo file
   rather than several recipes sharing one image. Requires `PEXELS_API_KEY` in `.env.local`. Writes
   `photo-credits.json` (gitignored) with the photographer/source URL per recipe id, for attribution.
3. `generate-photo-prompts.mjs` — unused by the Pexels path; writes `photo-prompts.csv` (gitignored),
   one AI-image-generation prompt per recipe built from its name plus its five heaviest ingredients.
   It exists as an alternative to stock photos and is not wired into the app.

Run 1 then 2 whenever `recipes.js` is regenerated. There is no per-category/per-dish-type shared
image — each recipe id always has its own downloaded `.jpg`.

### State and persistence

Per-user state lives in a single Supabase table, `public.plans` (schema + RLS policies in
`supabase/schema.sql`), one row per `user_id` with six JSONB columns, the first four mirroring
what used to be separate `localStorage` keys:

- `plan` — the meal plan: `{ [dateKey]: { [category]: recipeId } }`
- `eaten` — the status of each planned meal: `{ [dateKey]: { [category]: true | "skip" } }`, where
  `true` is "zjedzone", `"skip"` is "pominiete" (see "Skipping a meal") and absent is neither
- `goals` — calorie goals (`{ global, days: { [dateKey]: target } }`)
- `extras` — ad-hoc food logged straight into a day (see "Quick entries" below):
  `{ [dateKey]: [ { id, name, kcal, p, f, c, cat } ] }`
- `favorites` — the user's saved quick entries, newest first, as an array rather than a map:
  `[ { id, name, kcal, p, f, c, cat } ]`
- `hidden` — ids of recipes the user switched off (see "Hiding recipes"): `[ 12, 47, 203 ]`

`dateKey` is zero-padded `YYYY-MM-DD` (see `keyOf`, `App.jsx:33`) — the same format
`<input type="date">` uses, which is why the shopping-list range inputs can bind to it directly and
why `from > to` string comparison sorts correctly.

`App.jsx` loads this row on mount (`select ... .eq("user_id", user.id).maybeSingle()`; upserts a
default row when none exists) and pushes changes back through **`syncColumn`/`sendColumn`**, a small
write layer worth understanding before touching it:

- Every change first writes the whole column value into `localStorage` under `pending-sync-<userId>`,
  then attempts a Supabase **`upsert`** (not `update`: an `update ... .eq("user_id")` matching no row
  resolves with `error === null`, so a missing row used to look like a successful save). The pending
  entry is deleted only after the server confirms the write.
- Writes are whole-value overwrites, never diffs, and are serialized per `userId:column` via the
  module-level `inFlight` map: a change arriving mid-flight replaces the queued value instead of
  firing a second request. This keeps responses in send order (a slow request can't clobber fresher
  data) and coalesces bursts like "Wylosuj dzień" into one trailing request.
- A failed write is retried with exponential backoff capped at `RETRY_MAX` (30 s) while holding its
  queue slot, so later edits fold into the retry. A fresh edit or an `"online"` event cancels the
  backoff and retries at once.
- `loadState` is `"loading" | "ready" | "error"`, and **only `"ready"` may write**. A failed load
  means we don't know what the server holds, so the app renders an error card instead of the planner
  rather than let this session's empty defaults be pushed over a real stored plan; it retries every
  15 s and on `"online"` until a load succeeds.
- `baseline` (a ref holding what the last successful load returned) lets the four sync effects tell
  a real edit from the state change the load itself caused — without it every app open pushed all
  four columns straight back up. The header shows a "Zapisywanie…" / "Offline — zapiszę później"
  chip whenever `pending-sync-<userId>` is non-empty.
- On load, anything left in `pending-sync-<userId>` wins over what the server returned (it was made
  on top of a fully loaded plan and never stored), and `flushPending` sends it once the load succeeds.
- `favorites` and `hidden` both arrived after the other four, so `loadPlan` selects `PLAN_COLS`
  optimistically and, on a `42703` (undefined column), retries with `PLAN_COLS_LEGACY` and sets
  `schemaReady = false`. A project running an out-of-date `schema.sql` therefore keeps a working
  planner instead of sitting behind the load-error card over features it has never used: only those
  two go missing, both screens say why, and their sync effects are skipped so a doomed write never
  parks the header on "Offline — zapiszę później". One flag covers both because they ship in the
  same migration — either the SQL has been applied and both work, or it hasn't and neither does.

Row Level Security means a user can only ever read/write the row matching their own `auth.uid()`,
enforced server-side regardless of what the client sends. The plan syncs across devices as long as
the user is signed into the same account — but only at load time: there is no realtime subscription
and no merge, so two devices editing the same column overwrite each other last-write-wins.

### Progress tracking (`src/Progress.jsx`)

The third tab, "Postępy": body measurements, photos and before/after comparison. It is the one part
of the app with its own table and its own file storage, and the only one that does normal per-row
CRUD rather than the whole-column overwrites the meal plan uses.

**A `ProgressEntry` is one check-in on a user-chosen date** (`public.progress`, one row per
`(user_id, date)` — the unique constraint is what makes "add for today" and "edit today" the same
action). Every measurement column is nullable **on purpose**: somebody may weigh themselves in the
morning and photograph in the evening, or track only weight for a few weeks. Nothing in the UI
requires a complete entry; the only guard is that a check-in must carry *something* (a measurement,
a photo or a note). Columns: `weight` (kg), `waist` / `hips` / `thigh` / `biceps` (cm),
`body_fat_percent`, `muscle_percent`, `photo_front` / `photo_side` / `photo_back` (storage paths),
`note`.

`METRICS` is the single source of truth for the seven tracked values — label, unit, chart colour,
sanity ceiling for validation, and `better: "up" | "down"`, which decides whether a delta is painted
green or red. Biceps and muscle percentage count as gains; everything else counts as losses.

**Views** (a `Segmented` switch, all inside the one tab):
- *Przegląd* — the latest check-in as a card (big weight plus the delta against the previous entry
  that has one), a weight sparkline, and the history list with a photo thumbnail per row. A floating
  green "+" opens the editor.
- *Wykresy* — metric picker × time range (1/3/6 mies., rok, całość) over the `Chart` component.
- *Metamorfoza* — two date pickers (oldest → newest by default), photo pairs per slot, a delta table,
  and "Udostępnij" which composes **one shareable image** on a canvas (title, date range with day
  count, before/after photos, delta table) and hands it to `navigator.share`, falling back to a
  download. The fallback matters: composing is async, so the tap that started it may no longer count
  as a user gesture by the time the share sheet is requested — any failure other than the user
  cancelling degrades to a download rather than an error.

**Charts have no library.** `Chart` is an inline SVG line with an area wash, a dot per real
measurement and a drag-to-read tooltip, sized from a `ResizeObserver`. Crucially it only plots
entries that actually carry the selected metric, so a partial check-in leaves a **gap** rather than a
zero — a weight-only entry adds a point to the weight chart and none to the others.

**Photos never go in the database.** They are resized client-side (1400 px full, 320 px thumbnail,
JPEG) and uploaded to the **private** `progress-photos` bucket at
`<user_id>/<entry_id>/<slot>.jpg`, with the thumbnail alongside as `<slot>_thumb.jpg`; only the path
is stored in the row. The first path segment being the owner is what the storage RLS policies match
against `auth.uid()`. Being private, every image needs a short-lived signed URL.
`createSignedUrls` is batched, and **which paths have been asked for is tracked in a `requested` ref,
never derived from the `urls` state**. That distinction is the whole point: an earlier version
computed the pending set as "paths not in `urls`" and listed `urls` as an effect dependency, so a
path that could not be signed — a file gone from storage, or the bucket policies from
`supabase/schema.sql` never applied — stayed pending forever and the effect re-fired on every one of
its own updates, hammering storage for as long as the tab was open. Each path is now attempted once
per mount; a per-object failure stays claimed (it is broken, not pending, and `SafeImg` renders a
placeholder), while a failure of the whole call is un-claimed so a later change to `entries` can try
again — never a timer. Saving an entry clears both the stale URL and the claim for its photos, so a
replaced file gets signed again.

An image that still fails to load — an expired signature (they last an hour), or an object that has
gone — calls `renewUrl` through `SafeImg`'s `onFail`, which drops the URL and asks for one fresh
signature. `renewed` caps that at a single attempt per path, so a genuinely broken file settles on
the placeholder instead of restarting the loop. Note `onFail` reports the *src* that failed, so
callers pass the storage path explicitly (`onFail={() => renewUrl(thumbPath)}`) — handing it
`renewUrl` directly keys the caches by URL and silently renews nothing. Uploads happen on save, not on selection, so cancelling an edit never leaves
orphan files; deleting an entry removes its files too.

Numbers are entered Polish-style: `parseNum` accepts a comma or a dot, `fmtNum` always renders a
comma.

**This tab does not share the plan's offline queue.** Progress rows are discrete inserts/updates, so
a failure surfaces as an error in the editor with the form still filled, rather than being queued —
deliberately simpler than the `plans` sync layer, and nothing is lost because the user's input stays
on screen. If `public.progress` is missing entirely, the tab says so and points at
`supabase/schema.sql`.

### Quick entries ("szybki wpis")

Food eaten outside the plan, logged in a couple of taps. The point of the feature is what it is
**not**: it never enters the recipe catalogue. `RECIPES` is a build artifact generated from the
spreadsheet, so an ad-hoc entry has no business in it — it would also come back as a search result
in `PickerModal` forever after. Each entry is therefore self-contained (its own name and numbers, no
recipe id) and lives in the `extras` column, not in `plan`.

Consequences worth knowing before touching this:

- **It counts everywhere the plan counts.** `dayTotals` adds `quickTotals(extras[dateKey])` to the
  kcal and macro sums and returns it as `totals.quick`; the day panel's "Zjedzone" counter includes
  ad-hoc entries unconditionally (they are logged after the fact, so they are eaten by definition);
  `PickerModal`'s remaining-budget strip counts them in `others`; and a calendar cell lights the dot
  for an entry's category, plus a grey dot for entries with no category.
- **"Wylosuj dzień" draws against what is left.** `drawTarget = targetFor(day) − quick kcal`, and
  the button names that number rather than the day's goal. A four-meal draw can never total less
  than `MIN_DAY` (2256 kcal, straight out of `SUMS[0].min`), so a large quick entry can put the
  remaining target out of reach — the panel says so instead of silently overshooting.
- **The form is deliberately half of "add a recipe".** Name (defaults to "Szybki wpis" when blank),
  kcal (the only hard requirement, validated), macros behind a collapsed section, optional meal
  category. No search, no units, no per-100 g maths, no date picker — it lands on the day currently
  selected in the calendar, which is also how you log something for a past day.
- Entries are editable and deletable from the "Dodatkowo" list; a "ręczny" tag marks them apart from
  planned meals, which otherwise use the same row styling.

**Saved quick entries ("Zapisane").** The same sheet keeps a per-user shortlist of things worth
logging again — a banana, an apple, the usual coffee — in the `favorites` column. Three decisions
carry it:

- **A saved item is a template, not a logged meal.** It has the same fields as an `extras` entry and
  no date, and tapping one only *fills the form*; the entry that lands in the day mints its own id.
  So deleting the logged meal never touches the list, logging half a banana never rewrites "Banan",
  and — as with everything here — nothing reaches `RECIPES`. Filling rather than logging outright is
  also why there is no one-tap add: the amount is the thing a user most often wants to adjust first.
- **Saving is explicit and upserts by name.** The "Zapisz na liście" toggle is off by default, and
  checking it stores the entry under its name (`favKey` = trimmed + lowercased): a second save of
  the same name refreshes the numbers on the item already there, keeping its id and its place,
  rather than growing a list of duplicate bananas. A genuinely new one goes to the top, and
  `FAV_MAX` (60) caps the list. The toggle's caption says which of the two is about to happen.
- **Deleting reuses the day panel's path** — `SwipeRow` → 200 ms collapse → `UndoToast`, through the
  same `removeRow` in `App`, keyed `fav:<id>`. The toast is `z-index: 60` against the sheet's
  `overlay(45)`, so undo stays reachable with the modal open.

The list renders only when adding (`isNew`) — a template picker stacked on an entry you are editing
is noise — and is capped at 224 px with its own scroll so the form below it stays in reach.

Shopping lists ignore `extras` entirely — ad-hoc food has no ingredient breakdown to buy, and saved
entries are no different.

### The shopping list and its breakdown

A date range in, one line per product out: `shopping` walks every planned day in the range, skips
meals marked `"skip"`, and sums each ingredient's grams **per portion** (`ing[].g / r.port`) under
its `aggKey(...)`. `ING_CAT` then buckets the lines into the `SHOP_CATS` order.

Each line also keeps the meals it was summed from, in `sources`, so a row can be expanded back into
its parts - a product bought for four different dinners shows which four. Points worth keeping:

- **The breakdown is built during the same walk, never recomputed on expand.** That walk already
  visits exactly the right meals; doing it a second time on demand is how the header and its
  breakdown start to disagree.
- **The header is computed *from* the sources, not alongside them.** Each source's grams are rounded
  to 0.1 g as they are stored and `it.g` is the rounded sum of exactly those numbers, so "the parts
  add up to the total" holds by construction rather than by luck. Verified over a 30-day plan: 136
  lines, 903 sources, zero disagreement.
- **One meal is one source.** 36 recipes list the same product on several lines - usually a spice
  split per component, `"Sól"` / `"Sól (do masła)"` / `"Sól (do ziemniaków)"`, which `aggKey` folds
  together by stripping the bracket. Those merge into a single source with the grams added and the
  household measure dropped, since it only ever described one of the lines. Left unmerged they would
  also hand React two rows with the same key.
- **Sources carry the recipe's own measure** (`measure`, from `houseMeasure(i.d)`) so the breakdown
  reads "1 szklanka" rather than only "240 g" - but **only for `port: 1` recipes**, because for a
  dish that makes four `d` describes the whole tray, not the one portion this day contributes.
- `date`, `cat` and `recipeId` are on every source deliberately: turning a source row into a
  tap-through to that meal needs no model change, only a handler.

In the UI each row owns its expanded flag (`openItems`, in memory only - it is a glance at "why",
not a record of the trip like the ticks are), so rows never affect each other, and a single-source
product expands exactly like any other. The chevron is a **sibling** of the tick `<label>`, not a
child: nested inside it, every tap that opened a breakdown would also tick the item off. The panel
stays mounted with `aria-hidden` when closed so its height can animate, and its `max-height` cap is
derived from the source count - each source is exactly two ellipsised lines, so the estimate never
clips.

### Removing a meal from a day

Every row in the day panel — the four planned slots and each ad-hoc entry — is wrapped in
`SwipeRow` (`ui.jsx`): drag it left to reveal a red delete action, the iOS pattern this is meant to
become natively. Three things about it are deliberate:

- **Gesture-first, never gesture-only.** The revealed action is a real focusable `<button>` with an
  `aria-label`, and focusing it slides its row open, so Tab reaches deletion on every row. The older
  paths (the picker's "Usuń posiłek z tego dnia", the quick sheet's "Usuń wpis") still work and are
  untouched. An empty slot renders no action at all (`disabled`), so there is nothing to delete.
- **The sliding layer must be opaque** (`background`, default `CARD`, `GREEN_SOFT` for a row marked
  eaten). It sits on top of the red action; leave it transparent and every row shows a permanent red
  stripe. Vertical drags are handed back to the browser (`touch-action: pan-y` plus an axis check on
  the first few pixels), so the gesture never fights page scrolling.
- **Undo, not confirm.** Deleting is frequent and cheap, so a dialog in front of each one gets old;
  the row collapses (a ~200 ms transition, then the state change commits) and an `UndoToast` offers
  one tap to put it back for 6 seconds. Undo restores exactly what was removed — a planned meal
  comes back with the exact status it had (eaten or skipped), an ad-hoc entry at its original index
  in the day's array.

Deleting only ever removes the day's entry. `RECIPES` is a static catalogue the app never writes to,
so a planned meal's recipe is untouched and remains findable in the picker; the other meals of the
day are likewise unaffected, and `dayTotals` recomputes from state so kcal and macros update in the
same render.

### Skipping a meal ("Pominiete")

A planned meal the user decides not to eat - eating out, no appetite, an off day. Deliberately not
deletion: the dish stays in its slot so the day still shows what was planned, and one tap puts it
back. It is the softer sibling of the swipe-to-delete above.

**The status lives in `eaten`, not in a column of its own.** That column holds one value per
`(dateKey, category)`: `true` (zjedzone), `"skip"` (pominiete), or nothing. One field rather than two
parallel maps, for two reasons - a meal can never be marked eaten *and* skipped, which two booleans
would happily allow, and it needed no migration, so the feature works against a `plans` table that
has never been re-created. `markMeal(dateKey, cat, value)` is the only writer: it sets the value,
clears it when the meal already carries that state (which is what makes both buttons toggles), takes
`null` to clear outright, and returns the previous state untouched when nothing would change - without
that last check `setMeal`'s status reset would mint a fresh `eaten` object, and a sync write, on
every single pick.

**A skipped meal leaves the day's numbers.** `dayTotals` still counts it in `planned` but adds none
of its kcal or macros, so the figure judged against the goal describes the day that is actually going
to happen. The consequences are all deliberate:

- the "Zjedzone x/N" denominator drops - a skipped meal is no longer something left to eat;
- the calendar cell's kcal drops with it, and that category's dot fades to 30% instead of vanishing:
  the day was still planned there, it just no longer carries those calories. A dot stays at full
  strength if an ad-hoc entry occupies the same category.
- **the shopping list drops its ingredients** - the whole point of skipping in advance. `shopping`
  passes over those meals and now takes `eaten` as a dependency.
- the picker's remaining-budget strip leaves it out of `others`, so a replacement is measured against
  the real remainder;
- a day whose meals are *all* skipped still reads as a planned day at 0 kcal, not as an empty one -
  which is why `dayTotals` returns on `planned || q.n` rather than on `n`.

**The UI only ever offers the move still open to a row.** A neutral row shows a compact circle-slash
icon button plus "Zjedzone?"; an eaten row hides the skip button; a skipped row shows a filled grey
"Pominiete" pill and no "Zjedzone?", greys its background to `FILL`, fades the body to 50% and
strikes through the dish name. Neither state can be reached without clearing the other first, which
is exactly what the single field buys. `fillDay` clears every status for the day, since a fresh draw
is a fresh day.

### Hiding recipes ("Dostosuj dietę")

Not every one of the 280 recipes suits every user, so any of them can be switched off. The screen
lives behind the sliders button in the header (`Settings.jsx`, an `overlay(48)` sheet) rather than in
a fourth tab: curating is a rare, deliberate act, and the header is also where the goal and profile
settings will land later.

**`buildCatalogue(hiddenSet)` is the single source of truth.** It returns the per-slot pools, the
draw table, the visible count and the empty-slot list, and *everything* that offers a recipe reads
from it — the picker's list, `drawDay`, the header count. Nothing else filters, so no screen can
drift out of step with what the user switched off. It is a `useMemo` over `hiddenSet`, so a toggle
refreshes every dependent view in the same render.

- **`POOLS` and `SUMS` used to be module constants and no longer are.** The draw table is now built
  per user by `buildSums(pools)` inside the catalogue, because hiding a recipe changes it. That
  costs ~0.2 ms against the full base, which is why it simply re-runs rather than being cached.
- **Hiding governs what is *offered*, never what is already held.** A meal sitting in the plan keeps
  rendering in the day panel, keeps its kcal in the totals, stays on the shopping list, and is put
  back at the top of its own picker even though it is switched off. Same principle as a narrowed
  `slots.js` rule: this must never silently rewrite a plan somebody already shopped for.
- **An empty slot is allowed and no longer fatal.** `SLOT_POOLS[cat].filter(...)` can return nothing,
  which used to reach `Math.min(...[])` → `Infinity` → `RangeError: Invalid typed array length` and
  white-screen the app. The catalogue now reports `canDraw: false` and `emptySlots`, the draw button
  disables itself and says which categories are empty, and that slot's picker offers a way back to
  the settings sheet. Hiding literally everything is a supported state with its own empty card.
- **Stored as exceptions, not as a copy of the catalogue.** `hidden` holds only the ids that are off,
  so a recipe added by a future regeneration of `recipes.js` shows up straight away instead of
  arriving hidden. The usual caveat applies: ids are positional, so a regeneration that renumbers
  them re-points the exceptions at different dishes.

**The screen itself** groups by the recipe's own `cat` — 70 apiece, each recipe appearing exactly
once — because that is what makes 280 rows manageable, while the `DIET_GROUPS` chips cut across it so
"wyłącz całą Dietę 5" is a chip plus one bulk tap. Sections start collapsed and render their rows
only when open (a search auto-expands the ones with matches), which keeps 280 rows off the first
paint. Each section header carries a tri-state checkbox acting on **what the filter currently
shows**, and it is a sibling of the expand button, not a child — nested, every tap meant to open a
section would switch the whole category off.

Hiding a category here is not the same as hiding a slot: `slots.js` moves 14 owsianki from `Kolacja`
into `Śniadanie`, so switching off the whole `Kolacja` category empties the Kolacja slot *and* takes
the Śniadanie slot from 84 to 70.

### PWA

`public/manifest.webmanifest` + `public/sw.js` make the deployed site installable on Android (native
"Install app" prompt) and iOS Safari ("Add to Home Screen"). The service worker registers only in
production builds (`import.meta.env.PROD` check in `main.jsx`). Its fetch strategy is **network-first
for every GET** — it always hits the network, caches an `ok` response into `planer-diety-v1`, and
only falls back to the cache when `fetch` throws. There is no precache on install, no cache
versioning/cleanup on activate, and no fetch timeout.

### Auth

Email/password only for now (`supabase.auth.signInWithPassword` / `signUp` in `Auth.jsx`) — social
login (Google/Apple) is a planned follow-up, not implemented. There is no password-reset or
resend-confirmation flow. Supabase's client defaults (`persistSession`/`autoRefreshToken`) keep users
signed in across reloads with no extra code. New signups require email confirmation by default (a
Supabase project setting) before they can sign in. Supabase's error strings are surfaced raw, so the
Polish UI can show English errors like "Invalid login credentials".

## Deployment

Still static hosting (`npm run build` → drag `dist/` to Netlify Drop, or Vercel auto-deploy on push),
but now requires two environment variables at build time — `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` — set in the host's dashboard (Netlify/Vercel project settings), not just
locally in `.env.local`. The anon key is safe to expose client-side by design; Row Level Security is
what actually protects data, not key secrecy.

Note `README.md` is stale: it still describes plans living in `localStorage` under `diet-plan-v1` and
does not mention Supabase, auth, or the required env vars. Prefer this file.

## Product scope and gaps

Written after a feature-by-feature comparison against the apps this one sits next to: **Respo**
(Polish, plan-first: a questionnaire produces a jadlospis, a shopping list and a dietitian chat),
**Fitatu** (Polish, diary-first, built on the big Polish product database) and **MyFitnessPal**
(global, diary-first). Kept here so a future session proposes work that fits this app instead of
re-deriving the landscape.

**This is a plan-first app and should stay one.** Its unit of work is a *designed day* drawn from a
curated base, not a food diary. That is Respo's model rather than Fitatu's, and it is where the real
advantage sits: 280 recipes with gram-level ingredients make the shopping list exact and automatic,
and `drawDay` can hit a calorie target uniformly at random - neither is something a diary app does.
Competing with Fitatu head-on is not winnable and not the point: its moat is a dietitian-moderated
Polish product database (own-brand items from Biedronka/Lidl/Zabka, chain-restaurant dishes) fed by a
barcode scanner. No version of this repo catches that.

**Hard limits that come from the data, not the code.** Worth stating because they look like UI
choices and are not:

- **The base spans only 2256-2787 kcal for a four-meal day** (`SUMS[0].min` and the draw's span), and
  `TARGETS` (2400/2500/2600/2700) quietly encodes that. Somebody who needs 1600 or 3200 kcal cannot
  be served at all. This is the single biggest constraint on who can use the app.
- **Four meals, always.** `CATS` is fixed; Respo asks how many meals a day you want.
- **Only grams can be summed.** `ing[].d` does carry the household measure ("4 sztuki", "1 szklanka")
  and the shopping breakdown shows it per source, but a *total* can only be given in grams: adding
  "2 sztuki" to "1 szklanka" is not defined. So the aggregated line stays "224 g" even where every
  source under it reads in eggs.
- **Macros only.** No fibre, sugar, salt, saturated fat or micronutrients anywhere in `RECIPES`.
- **No allergen or diet tags** (wege, bezglutenowa, laktoza) - only free-text ingredient names.

**Gaps worth closing, most valuable first.** Each is judged on what it costs *here*, given the
architecture, not in the abstract:

1. **Portion scaling** - multiply a recipe's kcal/macros/ingredient grams by a factor so the same 280
   recipes serve 1600-3200 kcal. Removes the hard limit above, makes the draw useful to everyone, and
   the shopping list already sums grams so it follows for free. The same factor applied to `eaten`
   also buys Respo's "zjadlem pol porcji".
2. **A real calorie goal** - any number, plus a TDEE wizard (height/weight/age/sex/activity/goal).
   Every competitor opens with that questionnaire. Here the weight already sits in `public.progress`,
   so the target can be suggested and re-suggested as weight moves. Blocked on nothing.
3. **Macro targets** - the day panel totals B/T/W but has nothing to compare them against. Targets in
   grams or as a % of the kcal goal, shown the way the kcal bar already is. Pure UI, data exists.
4. **Exclusions by ingredient** - "nie jem X" as ingredient substrings filtered out of the
   catalogue. Switching *recipes* off is done (see "Hiding recipes"); doing it by ingredient is the
   remaining half, and `ing[].n` is already there, so it is a filter rather than new data.
5. **Shopping list, to Respo's level** - "mam w domu" (a pantry tick distinct from "bought"), manual
   items, share/export. The list is this app's strongest feature; the per-product breakdown is done
   (see "The shopping list and its breakdown"), these three are what is left.
6. **Password reset** - `supabase.auth.resetPasswordForEmail` plus a recovery screen. There is
   currently *no* way back into an account with a forgotten password. The smallest item here, and the
   only one that is a hole rather than a gap.
7. **Copy a day / plan a week** - "powtorz wczoraj", "wylosuj tydzien", copy a day across a range.
   `drawDay` exists already; this is plumbing, and it is how anyone actually fills a month.
8. **Water** - present in all three competitors, one more column beside `extras`, trivially cheap.
9. **A weekly summary** - adherence (planned vs `eaten` vs `extras`) over a week, in the Postepy tab
   where the charts already live. Ties the two halves of the app together and needs no new data.
10. **Reminders** - a push at meal times or an evening "domknij dzien" nudge. Web Push works on
    Android and on installed iOS PWAs (16.4+) and carries over to a native shell. Retention is the
    one thing this app currently has no answer for.
11. **AI logging from a photo** - as of 2026 both Fitatu and Respo estimate a meal's calories from a
    photo (Fitatu adds voice), so this reads as table stakes rather than a nice-to-have. It needs a
    server-side call - the Supabase anon key is meant to ship to the client, an Anthropic key is not -
    so a Supabase Edge Function, never a fetch from the browser.
12. **Barcode scanning** - only worth it against Open Food Facts (free, reasonable Polish coverage),
    and only as a way to fill a *quick entry*, never to grow `RECIPES`. Accept up front that coverage
    will sit far below Fitatu's.

**Deliberately not worth building here**: a crowd-sourced product database, a social feed, a
hand-rolled exercise/step tracker (an Apple Health / Health Connect integration once the app goes
native, not a manual one), ads or a paywall, and anything that writes to `RECIPES` at runtime.

## Known issues

Verified against the code. The data-loss and correctness groups are fixed; performance and the
minor items are open. Do not "rediscover" any of it as new bugs.

**Photo previews, fast deletes, expired signatures — fixed**
Three defects found in the audit after the redesign: the entry editor revoked the *previous* set of
preview blobs on every change (so adding a second photo killed the first one's preview); deleting two
rows within the 200 ms collapse cancelled the first delete instead of landing it; and a signed URL
that had expired left a dead `<img>` with no way back. Fixed by an unmount-only preview cleanup, a
`pendingRemoval` ref that flushes rather than cancels, and the one-shot `renewUrl` path above.

**Storage request loop — fixed**
Opening "Postępy" with a photo that could not be signed used to re-request signed URLs endlessly
(38 000 calls in seconds in a harness; bounded only by network latency against real Supabase). Fixed
by the `requested` ref described under "Progress tracking" — do not reintroduce `urls` as a
dependency of that effect.

**Data loss — fixed, see "State and persistence"**
The four ways an edit could be lost (empty-state overwrite after a failed load, `update` silently
matching no row, the retry queue dropping a value on a non-network error, and no sign that any of it
had happened) are addressed by the `loadState` gate, `upsert`, the backoff retry and the unsaved
chip. Don't reintroduce them: never write a column before a load has succeeded, and never treat a
resolved write as stored without checking `error`.

**Correctness / UX — fixed**
Both modals are now rendered conditionally (`{picker && <PickerModal …>}`), so each open remounts
them and the picker's search box and diet filter start empty. Escape closes the topmost modal —
handled in `App`'s scroll-lock effect rather than per component, so a recipe preview opened on top of
the picker closes first instead of both closing at once; picker rows activate on Space as well as
Enter. Calendar dots go through `byId[...]`, so a plan entry whose recipe id no longer exists no
longer draws a dot the day panel and totals disagree with. Shopping-list ticks live in
`localStorage` under `shop-checked-<userId>` together with the date range they belong to, so they
survive a reload and reset when you plan a different trip (they are deliberately not in Supabase —
a half-ticked list belongs to the phone in the shop, not to every device).

`drawDay` replaced the old "sample 500 random combos" draw with weighted sampling over a precomputed
table of how many days reach each kcal total (`SUMS`), which makes a draw uniform over every day
within tolerance. Verified against an exhaustive count: 11,315,777 fitting days at a 2400 goal and
246,899 at 2700 (11,689,399 / 268,076 before `slots.js` narrowed the `Kolacja` pool; the draw's
span is still 2256–2787 kcal), and the draw's distribution passes a chi-square goodness-of-fit test
at both. The
tolerance widens from 50 kcal only when nothing fits, so out-of-range goals still return a full day.
Drawing across all five diets is deliberate — see the comment above `POOLS`.

**Performance**
- Single ~724 kB bundle: `recipes.js` + `instructions.js` (~330 kB) load eagerly even though `STEPS`
  is only needed inside `RecipeModal`.
- `public/recipes/` is ~23 MB of unresized Pexels JPEGs (largest 942 kB) served into 46–58 px
  thumbnails and a 200 px hero. Combined with the SW's network-first policy, these immutable images
  are re-fetched on every visit and only serve from cache when the network is unreachable.
- No fetch timeout in `sw.js`, so on a hanging (not failed) connection the app waits instead of
  falling back to cache; there is no install-time precache, so the first offline visit fails outright.

**Minor**
- `sw.js` caches Supabase REST GET responses, so a user's plan JSON sits in Cache Storage after
  sign-out, and `planer-diety-v1` is never pruned.
- In dev, React StrictMode runs the load effect twice, so first login attempts a duplicate `insert`
  that logs a primary-key conflict.
- Data nits: recipe 124 ("Przekąska z wafli ryżowych") has macros implying ~336 kcal against a stated
  298; the name "Jabłko + migdały" is used by two recipes.
- Dependencies are behind by a major version each (React 18 → 19, Vite 5 → 8, `@vitejs/plugin-react`
  4 → 6); `npm audit` reports 0 vulnerabilities.
