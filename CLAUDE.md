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
verification is `npm run build` succeeding and manually exercising the app in a browser.

Requires a `.env.local` (gitignored, see `.env.example`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` for a Supabase project that has run `supabase/schema.sql` — without it,
sign-in/sign-up will fail against an unconfigured client.

## Architecture

**Almost the entire app is one file: `src/App.jsx` (~600 lines).** It contains every component
(calendar grid, day panel, recipe picker modal, recipe detail modal, shopping list) and all state
management — there is no router, no component library, no CSS files (styling is inline `style={}`
objects throughout, using a fixed hand-picked color palette defined as constants at the top of the
file: `CAT_COLORS`, `SHOP_ICONS`, etc.). When making UI changes, match this inline-style convention
rather than introducing a CSS/styling system.

`src/main.jsx` mounts `<Root />` (not `<App />` directly) and registers the service worker
(production only). `src/Root.jsx` is the auth gate: it checks `supabase.auth.getSession()` and
subscribes to `onAuthStateChange`, rendering `<Auth />` (`src/Auth.jsx`, email/password sign-in and
sign-up) when signed out, or `<App session={session} />` when signed in. `App` receives the Supabase
session as a prop and reads `session.user.id`/`session.user.email` — it is not designed to render
without one.

### Data layer (`src/data/`)

Three generated, machine-written JS files — treat them as build artifacts, not hand-edited source:

- `recipes.js` — exports `RECIPES`, an array of ~280 recipe objects. Shape:
  `{ id, diet, day, cat, name, kcal, p, f, c, port, time, ing: [{ n, d, g }], note, img }`
  (`diet`/`day` place a recipe within one of 5 named meal plans "Dieta 1"–"Dieta 5"; `cat` is one of
  `Śniadanie`/`Obiad`/`Kolacja`/`Przekąska`; `ing[].g` is grams used for shopping-list math; `img` is
  an optional explicit photo URL).
- `categories.js` — exports `ING_CAT`, a map of normalized ingredient name → shopping category
  (`Warzywa`, `Nabiał i jajka`, etc.), used to group the shopping list.
- `instructions.js` — exports `STEPS`, a map of recipe `id` → newline-separated prep instructions.

**Source of truth is an Excel file** (`Baza_posilkow_z_kategoriami.xlsx`, not checked into the repo),
not these JS files. Per `README.md`, the intended regeneration workflow when the spreadsheet changes
is: upload the Excel to Claude and ask it to regenerate `recipes.js`/`categories.js` to match the
schema above, then replace the files — there is no build script that does this automatically.

### Recipe photos

`RecipeThumb`/`RecipeModal` in `App.jsx` resolve an image as `r.img || \`recipes/${r.id}.jpg\``, i.e.
falling back to a local file at `public/recipes/<id>.jpg`. On load error they silently swap to a
colored category-icon placeholder (`onError` handler). `public/recipes/` currently exists but is
empty — no recipe has a photo yet, so every recipe renders its icon placeholder.

### State and persistence

Per-user state lives in a single Supabase table, `public.plans` (schema + RLS policies in
`supabase/schema.sql`), one row per `user_id` with three JSONB columns mirroring what used to be
separate `localStorage` keys:

- `plan` — the meal plan: `{ [dateKey]: { [category]: recipeId } }`
- `eaten` — which planned meals are checked off as eaten
- `goals` — calorie goals (`{ global, days: { [dateKey]: target } }`)

`dateKey` is `YYYY-M-D` (see `keyOf`). `App.jsx` loads this row on mount (`select` scoped to
`user.id`; inserts a default row on first login) and pushes changes back with a separate `update`
per column in three `useEffect`s keyed on `[value, loaded, user.id]` — same shape as the old
localStorage effects, just talking to Supabase instead. Row Level Security means a user can only ever
read/write the row matching their own `auth.uid()`, enforced server-side regardless of what the
client sends. The plan now syncs across devices/browsers as long as the user is signed into the same
account; there is no offline queue, so writes made while offline are lost rather than replayed.

### PWA

`public/manifest.webmanifest` + `public/sw.js` (network-first fetch strategy, falls back to cache
offline) make the deployed site installable on Android (native "Install app" prompt) and iOS Safari
("Add to Home Screen"). The service worker only registers in production builds
(`import.meta.env.PROD` check in `main.jsx`).

### Auth

Email/password only for now (`supabase.auth.signInWithPassword` / `signUp` in `Auth.jsx`) — social
login (Google/Apple) is a planned follow-up, not implemented. Supabase's client defaults
(`persistSession`/`autoRefreshToken`) keep users signed in across reloads with no extra code.
New signups require email confirmation by default (a Supabase project setting) before they can sign in.

## Deployment

Still static hosting (`npm run build` → drag `dist/` to Netlify Drop, or Vercel auto-deploy on push),
but now requires two environment variables at build time — `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` — set in the host's dashboard (Netlify/Vercel project settings), not just
locally in `.env.local`. The anon key is safe to expose client-side by design; Row Level Security is
what actually protects data, not key secrecy.
