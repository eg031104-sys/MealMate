import raw from "./data/genuine-recipes.json";
import type { Recipe } from "./domain";
import { archiveVariations } from "./catalogue";
export const genuineRecipes = raw as Recipe[];
export function upgradeCatalogue(existing: Recipe[]) {
  const recipes = archiveVariations(existing);
  for (const recipe of genuineRecipes)
    if (
      !recipes.some(
        (r) =>
          r.id === recipe.id ||
          r.name.trim().toLowerCase() === recipe.name.trim().toLowerCase(),
      )
    )
      recipes.push(recipe);
  return recipes;
}
