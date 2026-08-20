// Sets the `img` field on every recipe in src/data/recipes.js to point at its shared
// group placeholder photo (public/recipes/groups/<group>.jpg), using the mapping from
// photo-groups.csv (generate-photo-groups.mjs) and the photos fetched by
// fetch-photo-groups.mjs. Rewrites recipes.js in place, preserving its existing
// formatting (only inserts an "img" field into each record).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseCsv(text) {
  return text
    .trim()
    .split("\n")
    .map(line => line.match(/"((?:[^"]|"")*)"/g).map(f => f.slice(1, -1).replace(/""/g, '"')));
}

const [header, ...rows] = parseCsv(readFileSync(path.join(root, "photo-groups.csv"), "utf8"));
const idIdx = header.indexOf("id");
const groupIdx = header.indexOf("group");
const groupById = new Map(rows.map(r => [Number(r[idIdx]), r[groupIdx]]));

const recipesPath = path.join(root, "src", "data", "recipes.js");
const src = readFileSync(recipesPath, "utf8");

let i = 0;
const recordRe = /\{"id": \d+.*?"note": (?:null|"(?:[^"\\]|\\.)*")\}/gs;
const out = src.replace(recordRe, record => {
  const idMatch = record.match(/^\{"id": (\d+)/);
  const id = Number(idMatch[1]);
  const group = groupById.get(id);
  if (!group) throw new Error(`No group found for recipe id ${id}`);
  i++;
  return record.slice(0, -1) + `, "img": "recipes/groups/${group}.jpg"}`;
});

if (i !== rows.length) {
  throw new Error(`Matched ${i} records in recipes.js but photo-groups.csv has ${rows.length} rows`);
}

writeFileSync(recipesPath, out, "utf8");
console.log(`Updated img field on ${i} recipes in src/data/recipes.js`);
