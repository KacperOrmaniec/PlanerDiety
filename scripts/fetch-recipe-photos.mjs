// Downloads one unique stock photo per recipe from the Pexels API, saved to
// public/recipes/<id>.jpg. Reads photo-queries.csv (generate-photo-queries.mjs).
//
// Many recipes share the same English query (e.g. several oatmeal variants all
// query "oatmeal bowl with fruit") - to still give each recipe its own photo
// instead of reusing one shared image, this fetches a pool of results per unique
// query (up to Pexels' page size) and round-robins a distinct photo from that pool
// to each recipe using that query, instead of searching once per recipe.
//
// Requires PEXELS_API_KEY in .env.local (get a free key at pexels.com/api).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  console.error("Missing PEXELS_API_KEY (set it in .env.local)");
  process.exit(1);
}

function parseCsv(text) {
  return text
    .trim()
    .split("\n")
    .map(line => line.match(/"((?:[^"]|"")*)"/g).map(f => f.slice(1, -1).replace(/""/g, '"')));
}

const [header, ...rows] = parseCsv(readFileSync(path.join(root, "photo-queries.csv"), "utf8"));
const recipes = rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));

const outDir = path.join(root, "public", "recipes");
mkdirSync(outDir, { recursive: true });

const byQuery = new Map(); // query -> [recipe, ...]
for (const r of recipes) {
  if (!byQuery.has(r.query)) byQuery.set(r.query, []);
  byQuery.get(r.query).push(r);
}

async function searchPhotos(query, perPage = 80) {
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

const results = [];
let queryIndex = 0;
const totalQueries = byQuery.size;

for (const [query, group] of byQuery) {
  queryIndex++;
  let photos = [];
  try {
    photos = await searchPhotos(query, Math.min(80, Math.max(group.length, 15)));
  } catch (err) {
    console.error(`FAILED search "${query}": ${err.message}`);
    for (const r of group) results.push({ id: r.id, name: r.name, query, status: "search-error", error: err.message });
    continue;
  }
  if (!photos.length) {
    console.warn(`No Pexels results for "${query}" (${group.length} recipes affected)`);
    for (const r of group) results.push({ id: r.id, name: r.name, query, status: "no-result" });
    continue;
  }
  console.log(`[${queryIndex}/${totalQueries}] "${query}" -> ${photos.length} results for ${group.length} recipe(s)`);

  for (let i = 0; i < group.length; i++) {
    const r = group[i];
    const photo = photos[i % photos.length]; // cycles only if a query has more recipes than results
    const outFile = path.join(outDir, `${r.id}.jpg`);
    try {
      const bytes = await downloadTo(photo.src.large, outFile);
      console.log(`  #${r.id} ${r.name} <- ${photo.url} [${(bytes / 1024).toFixed(0)} KB]`);
      results.push({ id: r.id, name: r.name, query, status: "ok", photographer: photo.photographer, source: photo.url });
    } catch (err) {
      console.error(`  FAILED #${r.id} ${r.name}: ${err.message}`);
      results.push({ id: r.id, name: r.name, query, status: "error", error: err.message });
    }
    await new Promise(res => setTimeout(res, 60));
  }
  // Pexels free tier: 200 req/hour for search calls - one search per unique query, stay polite.
  await new Promise(res => setTimeout(res, 250));
}

writeFileSync(
  path.join(root, "photo-credits.json"),
  JSON.stringify(results.sort((a, b) => a.id - b.id), null, 2),
  "utf8"
);

const failed = results.filter(r => r.status !== "ok");
console.log(`\nDone: ${results.length - failed.length}/${results.length} recipe photos saved to public/recipes/`);
if (failed.length) {
  console.log(`Failed/missing: ${failed.map(f => `#${f.id}`).join(", ")}`);
}
