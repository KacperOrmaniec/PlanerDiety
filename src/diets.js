// Diet groups, lifted out of App.jsx so the settings screen can label recipes the same way the
// picker does without importing from App (which imports the settings screen back).
import { RECIPES } from "./data/recipes.js";

// Diets are grouped by the calorie level they actually plan for, not by their spreadsheet name:
// each "Dieta N" is 14 designed days, and diets whose average day lands within GROUP_TOL of each
// other (all of them, not just pairwise neighbours) are one and the same plan as far as anyone
// choosing a meal is concerned. In the current
// base that joins Dieta 1-4 (2397-2410 kcal/day) into "2400 kcal" and leaves Dieta 5 (2699) as
// "2700 kcal". Derived from RECIPES so it stays right when the base is regenerated from Excel.
const GROUP_TOL = 100;

const DIET_GROUPS = (() => {
  const dayKcal = {};                                  // `${diet}|${day}` -> kcal of that designed day
  for (const r of RECIPES) {
    if (!r.diet) continue;
    const k = `${r.diet}|${r.day}`;
    dayKcal[k] = (dayKcal[k] || 0) + r.kcal;
  }
  const perDiet = {};
  for (const [k, kcal] of Object.entries(dayKcal)) {
    const diet = k.slice(0, k.lastIndexOf("|"));
    (perDiet[diet] = perDiet[diet] || []).push(kcal);
  }
  const means = Object.entries(perDiet)
    .map(([diet, days]) => ({ diet, mean: days.reduce((a, b) => a + b, 0) / days.length }))
    .sort((a, b) => a.mean - b.mean);

  // Compared against the lightest diet already in the cluster (the list is sorted), so a group
  // never chains: every diet in one is within GROUP_TOL of every other, not just of its neighbour.
  const clusters = [];
  for (const d of means) {
    const last = clusters[clusters.length - 1];
    if (last && d.mean - last.means[0] <= GROUP_TOL) { last.diets.push(d.diet); last.means.push(d.mean); }
    else clusters.push({ diets: [d.diet], means: [d.mean] });
  }
  return clusters.map(c => {
    const mean = c.means.reduce((a, b) => a + b, 0) / c.means.length;
    const kcal = Math.round(mean / 100) * 100;
    return { kcal, label: `${kcal} kcal`, diets: c.diets };
  });
})();

// recipe's diet -> the group it belongs to, for filtering and for the "plan" line on a recipe
const GROUP_OF = {};
DIET_GROUPS.forEach(g => g.diets.forEach(d => { GROUP_OF[d] = g; }));

export { DIET_GROUPS, GROUP_OF };
