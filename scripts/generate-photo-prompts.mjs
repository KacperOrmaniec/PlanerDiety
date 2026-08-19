// Regenerates photo-prompts.csv from src/data/recipes.js.
// Run whenever recipes.js is regenerated from the source Excel file.
import { RECIPES } from "../src/data/recipes.js";
import { writeFileSync } from "node:fs";

const STYLE_SUFFIX =
  "professional food photography, served on a simple matte ceramic plate or bowl, " +
  "shot from a 45-degree angle, soft natural window light from the left, blurred neutral " +
  "light-wood table background, shallow depth of field, natural realistic colors, not " +
  "oversaturated, realistic appetizing textures, no hands, no scattered cutlery, no steam " +
  "swirls, no text, no logos, no extra props, minimalist home-kitchen stock-photo style, " +
  "high resolution, DSLR quality, single dish centered in frame";

function topIngredients(r, n = 5) {
  return [...r.ing]
    .sort((a, b) => (b.g || 0) - (a.g || 0))
    .slice(0, n)
    .map(i => i.n);
}

function csvField(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

const rows = [["id", "filename", "category", "diet", "day", "name", "prompt"]];

for (const r of RECIPES) {
  const ingredients = topIngredients(r).join(", ");
  const prompt =
    `Professional food photography of a Polish home-cooked dish called "${r.name}", ` +
    `made with ${ingredients}. ${STYLE_SUFFIX}`;
  rows.push([
    r.id,
    `${r.id}.jpg`,
    r.cat,
    r.diet || "",
    r.day || "",
    r.name,
    prompt,
  ]);
}

const csv = rows.map(row => row.map(csvField).join(",")).join("\n");
writeFileSync(new URL("../photo-prompts.csv", import.meta.url), csv, "utf8");

console.log(`Wrote ${rows.length - 1} prompts to photo-prompts.csv`);
