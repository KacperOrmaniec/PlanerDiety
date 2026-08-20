// Groups recipes from src/data/recipes.js into shared visual "photo groups" (English),
// e.g. every oatmeal recipe shares one placeholder photo, every wrap shares another.
// Intended for sourcing one stock photo per group (e.g. via the Pexels API) instead of
// generating a unique AI photo per recipe. Run whenever recipes.js is regenerated.
//
// Outputs (repo root):
//   photo-groups.csv        - id, cat, name, group, query (one row per recipe)
//   photo-group-queries.csv - group, query, count (one row per group, for the Pexels step)
import { RECIPES } from "../src/data/recipes.js";
import { writeFileSync } from "node:fs";

// Ordered rules: first regex match against the recipe name wins.
// [regex, [englishGroupSlug, suggestedPexelsQuery]]
const RULES = [
  [/kulk[ai]|^baton\b|^batony\b/i, ["energy-balls", "energy balls bites"]],
  [/trufle z/i, ["energy-balls", "energy balls bites"]],
  [/sushi/i, ["sushi", "sushi rolls"]],
  [/spring roll/i, ["spring-rolls", "spring rolls"]],
  [/tacos|quesadill/i, ["tacos", "tacos mexican food"]],
  [/burrito/i, ["burrito", "burrito wrap"]],
  [/pizza|pinsa/i, ["pizza", "pizza slice"]],
  [/\btortilla\b|\bwrap\b/i, ["tortilla-wrap", "tortilla wrap sandwich"]],
  [/jajeczni|omlet|frittata|szakszuk|jajka w koszulkach|jajkiem sadzonym/i, ["eggs", "fried eggs breakfast"]],
  [/kanapk|\btost\b|tosty|grahamk|buł[ekaę]|pieczyw|chleb|grzank/i, ["sandwich", "open sandwich rye bread"]],
  [/sałatk/i, ["salad", "fresh salad bowl"]],
  [/owsian/i, ["oatmeal", "oatmeal bowl with fruit"]],
  [/jaglank/i, ["millet-porridge", "millet porridge bowl"]],
  [/kostki z kaszy manny|kasza manny|kaszy manny/i, ["semolina-pudding", "semolina pudding dessert"]],
  [/ryżowy pudding|^ryż z /i, ["rice-pudding", "rice pudding fruit"]],
  [/pudding chia|chia bowl|nasiona chia/i, ["chia-pudding", "chia pudding"]],
  [/pudding proteinowy|pudding z tapioki|jagodowy koktajl z tapioką/i, ["protein-pudding", "protein pudding cup"]],
  [/granola/i, ["granola", "granola bowl yogurt"]],
  [/makaron/i, ["pasta", "pasta dish"]],
  [/burger/i, ["burger", "burger"]],
  [/kebab|gyros/i, ["gyros-kebab", "gyros kebab"]],
  [/stek\b|steki|wołow|rostbef/i, ["steak", "grilled beef steak"]],
  [/łoso/i, ["salmon", "salmon dish"]],
  [/krewetk/i, ["shrimp", "shrimp dish"]],
  [/tuńczyk/i, ["tuna", "tuna dish"]],
  [/dorsz|mintaj|grillowana ryba|ryba z/i, ["fish", "grilled fish dish"]],
  [/kurczak|drobiow/i, ["chicken", "grilled chicken dish"]],
  [/smoothie|koktajl|\bshake\b|^sok /i, ["smoothie", "fruit smoothie glass"]],
  [/lody/i, ["ice-cream", "ice cream dessert"]],
  [/frytki|chipsy/i, ["fries-chips", "fries chips snack"]],
  [/placuszki|naleśniki/i, ["pancakes", "pancakes stack"]],
  [/hummus/i, ["hummus", "hummus dip"]],
  [/pieczone warzywa|warzywa z sosem|marchewk/i, ["roasted-vegetables", "roasted vegetables"]],
  [/wafl[ei]/i, ["rice-cakes", "rice cakes snack"]],
  [/gulasz|ciecierzyc|soczewic/i, ["legume-stew", "lentil chickpea stew"]],
  [/kasza gryczana|gryczan|pęczak|kuskus|komosa/i, ["grain-bowl", "grain bowl"]],
  [/serek|twaro[żg]|skyr|jogurt/i, ["dairy-bowl", "cottage cheese yogurt bowl fruit"]],
  [/kisiel/i, ["fruit-pudding", "fruit kissel pudding"]],
  [/deser|snickers|\bciastko\b|kinder|bounty|\bmars\b|czekolad/i, ["sweet-dessert", "sweet dessert plate"]],
  [/orzech|migdał|pestki|pekan|makadamia|nerkowca|daktyl/i, ["nuts-fruit-snack", "mixed nuts fruit snack"]],
  [/^banan$|^marakuja$|owoce pod kruszonką|sałatka owocowa|^owoc|fruvita/i, ["fruit", "fresh fruit bowl"]],
  [/rice bowl|ryż/i, ["rice-bowl", "rice bowl"]],
  [/roladk/i, ["vegetable-rolls", "zucchini rolls appetizer"]],
  [/klopsik|mięso w sosie pomidorowym/i, ["meatballs", "meatballs tomato sauce"]],
  [/oliwki/i, ["olives-snack", "olives snack bowl"]],
];

// One-off overrides for names with no reliable shared keyword.
const ID_OVERRIDES = {
  1: ["protein-pudding", "protein pudding cup"], // Fit Monte
  196: ["smoothie", "protein shake glass"], // Odżywka + mleko
};

function classify(r) {
  if (ID_OVERRIDES[r.id]) return ID_OVERRIDES[r.id];
  for (const [re, meta] of RULES) {
    if (re.test(r.name)) return meta;
  }
  return ["misc-" + r.cat.toLowerCase(), "polish home cooked meal"];
}

function csvField(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

const perRecipeRows = [["id", "cat", "name", "group", "query"]];
const groupCounts = new Map(); // group -> { query, count }

for (const r of RECIPES) {
  const [group, query] = classify(r);
  perRecipeRows.push([r.id, r.cat, r.name, group, query]);
  const entry = groupCounts.get(group) || { query, count: 0 };
  entry.count += 1;
  groupCounts.set(group, entry);
}

const groupRows = [["group", "query", "count"]];
for (const [group, { query, count }] of [...groupCounts.entries()].sort((a, b) => b[1].count - a[1].count)) {
  groupRows.push([group, query, count]);
}

writeFileSync(
  new URL("../photo-groups.csv", import.meta.url),
  perRecipeRows.map(row => row.map(csvField).join(",")).join("\n"),
  "utf8"
);
writeFileSync(
  new URL("../photo-group-queries.csv", import.meta.url),
  groupRows.map(row => row.map(csvField).join(",")).join("\n"),
  "utf8"
);

console.log(`Wrote ${perRecipeRows.length - 1} recipe->group rows to photo-groups.csv`);
console.log(`Wrote ${groupRows.length - 1} groups to photo-group-queries.csv`);
