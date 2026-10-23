import raw from "./data/curated-recipes.json";
import type { Recipe } from "./domain";
export const curatedRecipes = raw as Recipe[];
export const curationTargets = {
  Dinner: 50,
  Lunch: 20,
  Breakfast: 20,
  Snacks: 10,
} as const;
export function curationCounts() {
  return Object.fromEntries(
    Object.keys(curationTargets).map((category) => [
      category,
      curatedRecipes.filter((recipe) => recipe.category === category).length,
    ]),
  ) as Record<keyof typeof curationTargets, number>;
}
