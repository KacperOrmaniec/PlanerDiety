// Builds an English Pexels search query for every recipe in src/data/recipes.js —
// one row per recipe, no shared groups. Run whenever recipes.js is regenerated.
//
// Output (repo root): photo-queries.csv - id, cat, name, query
import { RECIPES } from "../src/data/recipes.js";
import { writeFileSync } from "node:fs";

// Ordered rules: first regex match against the recipe name wins.
// [regex, englishQuery]
const RULES = [
  [/kulk[ai]|^baton\b|^batony\b/i, "energy balls bites"],
  [/trufle z/i, "energy balls bites"],
  [/sushi/i, "sushi rolls"],
  [/spring roll/i, "spring rolls"],
  [/tacos|quesadill/i, "tacos mexican food"],
  [/burrito/i, "burrito wrap"],
  [/pizza|pinsa/i, "pizza slice"],
  [/\btortilla\b|\bwrap\b/i, "tortilla wrap sandwich"],
  [/jajeczni|omlet|frittata|szakszuk|jajka w koszulkach|jajkiem sadzonym/i, "fried eggs breakfast"],
  [/kanapk|\btost\b|tosty|grahamk|buł[ekaę]|pieczyw|chleb|grzank/i, "open sandwich rye bread"],
  [/sałatk/i, "fresh salad bowl"],
  [/owsian/i, "oatmeal bowl with fruit"],
  [/jaglank/i, "millet porridge bowl"],
  [/kostki z kaszy manny|kasza manny|kaszy manny/i, "semolina pudding dessert"],
  [/ryżowy pudding|^ryż z /i, "rice pudding fruit"],
  [/pudding chia|chia bowl|nasiona chia/i, "chia pudding"],
  [/pudding proteinowy|pudding z tapioki|jagodowy koktajl z tapioką/i, "protein pudding cup"],
  [/granola/i, "granola bowl yogurt"],
  [/makaron/i, "pasta dish"],
  [/burger/i, "burger"],
  [/kebab|gyros/i, "gyros kebab"],
  [/stek\b|steki|wołow|rostbef/i, "grilled beef steak"],
  [/łoso/i, "salmon dish"],
  [/krewetk/i, "shrimp dish"],
  [/tuńczyk/i, "tuna dish"],
  [/dorsz|mintaj|grillowana ryba|ryba z/i, "grilled fish dish"],
  [/kurczak|drobiow/i, "grilled chicken dish"],
  [/smoothie|koktajl|\bshake\b|^sok /i, "fruit smoothie glass"],
  [/lody/i, "ice cream dessert"],
  [/frytki|chipsy/i, "fries chips snack"],
  [/placuszki|naleśniki/i, "pancakes stack"],
  [/hummus/i, "hummus dip"],
  [/pieczone warzywa|warzywa z sosem|marchewk/i, "roasted vegetables"],
  [/wafl[ei]/i, "rice cakes snack"],
  [/gulasz|ciecierzyc|soczewic/i, "lentil chickpea stew"],
  [/kasza gryczana|gryczan|pęczak|kuskus|komosa/i, "grain bowl"],
  [/serek|twaro[żg]|skyr|jogurt/i, "cottage cheese yogurt bowl fruit"],
  [/kisiel/i, "fruit kissel pudding"],
  [/deser|snickers|\bciastko\b|kinder|bounty|\bmars\b|czekolad/i, "sweet dessert plate"],
  [/orzech|migdał|pestki|pekan|makadamia|nerkowca|daktyl/i, "mixed nuts fruit snack"],
  [/^banan$|^marakuja$|owoce pod kruszonką|sałatka owocowa|^owoc|fruvita/i, "fresh fruit bowl"],
  [/rice bowl|ryż/i, "rice bowl"],
  [/roladk/i, "zucchini rolls appetizer"],
  [/klopsik|mięso w sosie pomidorowym/i, "meatballs tomato sauce"],
  [/oliwki/i, "olives snack bowl"],
];

// One-off overrides for names with no reliable shared keyword.
const ID_OVERRIDES = {
  1: "protein pudding cup", // Fit Monte
  196: "protein shake glass", // Odżywka + mleko
};

function baseQuery(r) {
  if (ID_OVERRIDES[r.id]) return ID_OVERRIDES[r.id];
  for (const [re, query] of RULES) {
    if (re.test(r.name)) return query;
  }
  return "polish home cooked meal";
}

function csvField(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

const rows = [["id", "cat", "name", "query"]];
for (const r of RECIPES) {
  rows.push([r.id, r.cat, r.name, baseQuery(r)]);
}

writeFileSync(
  new URL("../photo-queries.csv", import.meta.url),
  rows.map(row => row.map(csvField).join(",")).join("\n"),
  "utf8"
);

console.log(`Wrote ${rows.length - 1} recipe photo queries to photo-queries.csv`);
