# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Planer diety" — a Polish-language meal planning PWA (calendar + shopping list). React 18 + Vite 5,
no backend and no build step beyond Vite: the entire recipe database is baked into static JS files at
build time, and all user state (the plan itself) lives in the browser's `localStorage`. There is no
server, no API, and no database — everything ships as static files.

## Commands

```bash
npm install      # install deps
npm run dev      # dev server at http://localhost:5173, hot reload
npm run build    # production build to dist/
npm run preview  # serve the dist/ build locally to sanity-check before deploying
```

There is no lint or test setup in this repo (no ESLint config, no test runner). The closest thing to
verification is `npm run build` succeeding and manually exercising the app in a browser.

## Architecture

**Almost the entire app is one file: `src/App.jsx` (~600 lines).** It contains every component
(calendar grid, day panel, recipe picker modal, recipe detail modal, shopping list) and all state
management — there is no router, no component library, no CSS files (styling is inline `style={}`
objects throughout, using a fixed hand-picked color palette defined as constants at the top of the
file: `CAT_COLORS`, `SHOP_ICONS`, etc.). When making UI changes, match this inline-style convention
rather than introducing a CSS/styling system.

`src/main.jsx` just mounts `<App />` and registers the service worker (production only).

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

All mutable state is per-browser `localStorage`, written from `useEffect` hooks keyed on load-complete:

- `diet-plan-v1` — the meal plan: `{ [dateKey]: { [category]: recipeId } }`
- `diet-eaten-v1` — which planned meals are checked off as eaten
- `diet-target-v1` — calorie goals (`{ global, days: { [dateKey]: target } }`)

`dateKey` is `YYYY-M-D` (see `keyOf`). There is no sync across devices/browsers and no accounts —
clearing site data wipes the plan.

### PWA

`public/manifest.webmanifest` + `public/sw.js` (network-first fetch strategy, falls back to cache
offline) make the deployed site installable on Android (native "Install app" prompt) and iOS Safari
("Add to Home Screen"). The service worker only registers in production builds
(`import.meta.env.PROD` check in `main.jsx`).

## Deployment

Static-only: `npm run build` then drag `dist/` to Netlify Drop, or connect the repo to Vercel for
auto-deploy on push. No environment variables, no server-side config.
