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
currently emits one ~682 kB JS chunk (~176 kB gzip) and warns about the 500 kB chunk limit — that
warning is expected, not a regression (see "Known issues").

Requires a `.env.local` (gitignored, see `.env.example`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` for a Supabase project that has run `supabase/schema.sql`. Without them the
app does not crash: `supabaseClient.js` exports `supabaseConfigured = false` (and `supabase = null`),
and `Root.jsx` renders a Polish "Brak konfiguracji Supabase" card instead of the auth screen.
`PEXELS_API_KEY` in the same file is used only by `scripts/fetch-recipe-photos.mjs` (Node, never
bundled).

## Architecture

**Almost the entire app is one file: `src/App.jsx` (~750 lines).** It contains every component
(calendar grid, day panel, `PickerModal`, `RecipeModal`, shopping list), the Supabase sync layer, and
all state management — there is no router, no component library, no CSS files.

Styling is inline `style={}` objects throughout, on a hand-picked "warm brutalism" palette defined as
constants at the top of the file: `INK`/`CREAM`/`PAPER`/`RED`/`MUTED`, plus `RULE`/`RULE_THIN`/
`RULE_THICK` borders and `HARD`/`HARD_SM` hard (unblurred) offset shadows, square corners, no
decorative emoji. Category colors are `CAT_COLORS`/`CAT_MARK`; shopping-list section order is
`SHOP_CATS`. Fonts (Bricolage Grotesque + JetBrains Mono, constants `SANS`/`MONO`) are loaded from
Google Fonts in `index.html`. The only non-inline CSS is two small `<style>` blocks in `App.jsx` and
`Auth.jsx` (focus rings, the `.b` press animation, one mobile grid-collapse media query). When making
UI changes, match this inline-style convention rather than introducing a CSS/styling system.

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
  `Śniadanie`/`Obiad`/`Kolacja`/`Przekąska`, 70 recipes each; `port` ∈ {1,2,4,5}; `ing[].g` is grams
  used for shopping-list math; `img` is an optional explicit photo URL — currently no recipe sets it).
- `categories.js` — exports `ING_CAT`, a map of normalized ingredient name → shopping category
  (`Warzywa`, `Nabiał i jajka`, etc.), used to group the shopping list. It currently covers 100% of
  the 306 distinct `aggKey(...)` values produced by `RECIPES` — nothing falls through to `Inne`.
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
`supabase/schema.sql`), one row per `user_id` with three JSONB columns mirroring what used to be
separate `localStorage` keys:

- `plan` — the meal plan: `{ [dateKey]: { [category]: recipeId } }`
- `eaten` — which planned meals are checked off as eaten: `{ [dateKey]: { [category]: true } }`
- `goals` — calorie goals (`{ global, days: { [dateKey]: target } }`)

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
- `baseline` (a ref holding what the last successful load returned) lets the three sync effects tell
  a real edit from the state change the load itself caused — without it every app open pushed all
  three columns straight back up. The header shows a "Zapisywanie…" / "Offline — zapiszę później"
  chip whenever `pending-sync-<userId>` is non-empty.
- On load, anything left in `pending-sync-<userId>` wins over what the server returned (it was made
  on top of a fully loaded plan and never stored), and `flushPending` sends it once the load succeeds.

Row Level Security means a user can only ever read/write the row matching their own `auth.uid()`,
enforced server-side regardless of what the client sends. The plan syncs across devices as long as
the user is signed into the same account — but only at load time: there is no realtime subscription
and no merge, so two devices editing the same column overwrite each other last-write-wins.

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

## Known issues

Verified against the code. The data-loss and correctness groups are fixed; performance and the
minor items are open. Do not "rediscover" any of it as new bugs.

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
within tolerance. Verified against an exhaustive count: 11,689,399 fitting days at a 2400 goal,
268,076 at 2700, and the draw's distribution passes a chi-square goodness-of-fit test at both. The
tolerance widens from 50 kcal only when nothing fits, so out-of-range goals still return a full day.
Drawing across all five diets is deliberate — see the comment above `POOLS`.

**Performance**
- Single ~682 kB bundle: `recipes.js` + `instructions.js` (~330 kB) load eagerly even though `STEPS`
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
