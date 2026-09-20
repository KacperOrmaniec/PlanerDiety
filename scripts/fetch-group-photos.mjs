// Downloads one distinct stock photo per recipe in a given `group` (see the `group` field in
// src/data/recipes.js) from the Pexels API, saved to public/recipes/<id>.jpg.
//
// Unlike scripts/fetch-recipe-photos.mjs (which drives the whole 280-recipe base off shared,
// regex-classified queries in photo-queries.csv), this targets a small, hand-curated group added
// outside the Excel regeneration flow: queries are written per recipe below rather than derived
// from the name, and only that group's photos are touched — running this never re-downloads or
// re-shares images with the rest of the base.
//
// Usage: node scripts/fetch-group-photos.mjs ["Group label"]
// Defaults to "Wysokobiałkowe na masę" (the 14 meal-prep recipes added 2026-09-20, ids 281-294).
// Requires PEXELS_API_KEY in .env.local (get a free key at pexels.com/api).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RECIPES } from "../src/data/recipes.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error("Missing PEXELS_API_KEY (set it in .env.local — see .env.example)");
  process.exit(1);
}

const GROUP = process.argv[2] || "Wysokobiałkowe na masę";

// One curated English query per recipe id — with only 14 recipes, a hand-written query per dish
// beats the shared-query round-robin the main pipeline uses at 280-recipe scale, and guarantees
// every recipe here searches (and therefore photographs) differently from its neighbours.
const QUERIES = {
  281: "pad thai noodles chicken",
  282: "korean chicken rice bowl",
  283: "arayes stuffed pita meat",
  284: "bagel breakfast sandwich egg bacon",
  285: "chocolate protein pudding dessert cup",
  286: "protein pancakes stack banana",
  287: "english muffin breakfast sandwich egg",
  288: "taco bowl beef potatoes",
  289: "creamy pasta chicken sun dried tomato",
  290: "korean fried chicken gochujang",
  291: "chicken gyros pita wrap",
  292: "honey garlic chicken noodles",
  293: "crispy chicken rice honey glaze",
  294: "smashburger grilled sandwich",
};

const recipes = RECIPES.filter(r => r.group === GROUP);
if (!recipes.length) {
  console.error(`No recipes with group "${GROUP}" found in src/data/recipes.js`);
  process.exit(1);
}
const missingQuery = recipes.filter(r => !QUERIES[r.id]);
if (missingQuery.length) {
  console.error(`No curated query for: ${missingQuery.map(r => `#${r.id} ${r.name}`).join(", ")}`);
  console.error("Add an entry to QUERIES in this script and re-run.");
  process.exit(1);
}

const outDir = path.join(root, "public", "recipes");
mkdirSync(outDir, { recursive: true });

async function searchPhotos(query, perPage = 15) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}": ${await res.text()}`);
  const data = await res.json();
  return data.photos ?? [];
}

async function downloadTo(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buf);
  return buf.length;
}

// Guards against two recipes' queries returning literally the same top photo (e.g. both landing
// on a generic "chicken" stock shot) — if that happens, the second recipe takes the next distinct
// result from its own search instead, so "one photo per recipe" holds even under overlap.
const usedUrls = new Set();
const results = [];

for (const r of recipes) {
  const query = QUERIES[r.id];
  let photos = [];
  try {
    photos = await searchPhotos(query);
  } catch (err) {
    console.error(`FAILED search #${r.id} "${query}": ${err.message}`);
    results.push({ id: r.id, name: r.name, query, status: "search-error", error: err.message });
    continue;
  }
  const photo = photos.find(p => !usedUrls.has(p.src.large)) || photos[0];
  if (!photo) {
    console.warn(`No Pexels results for #${r.id} "${query}"`);
    results.push({ id: r.id, name: r.name, query, status: "no-result" });
    continue;
  }
  usedUrls.add(photo.src.large);
  const outFile = path.join(outDir, `${r.id}.jpg`);
  try {
    const bytes = await downloadTo(photo.src.large, outFile);
    console.log(`#${r.id} ${r.name} <- "${query}" -> ${photo.url} [${(bytes / 1024).toFixed(0)} KB]`);
    results.push({ id: r.id, name: r.name, query, status: "ok", photographer: photo.photographer, source: photo.url });
  } catch (err) {
    console.error(`FAILED download #${r.id} ${r.name}: ${err.message}`);
    results.push({ id: r.id, name: r.name, query, status: "error", error: err.message });
  }
  await new Promise(res => setTimeout(res, 250)); // Pexels free tier: 200 req/hour
}

writeFileSync(
  path.join(root, "photo-credits-group.json"),
  JSON.stringify(results, null, 2),
  "utf8"
);

const failed = results.filter(r => r.status !== "ok");
console.log(`\nDone: ${results.length - failed.length}/${results.length} photos saved to public/recipes/`);
if (failed.length) console.log(`Failed/missing: ${failed.map(f => `#${f.id}`).join(", ")}`);
