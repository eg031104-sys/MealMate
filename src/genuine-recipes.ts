import raw from "./data/genuine-recipes.json";
import { curatedRecipes } from "./curated-recipes";
import type { Recipe } from "./domain";
import { archiveVariations } from "./catalogue";
export const genuineRecipes = raw as Recipe[];
import {
  applyRecipeEstimates,
  type MeasurementOverrides,
} from "./measurements";
export function upgradeCatalogue(
  existing: Recipe[],
  overrides: MeasurementOverrides = {},
) {
  const recipes = archiveVariations(existing);
  for (const recipe of [...genuineRecipes, ...curatedRecipes])
    if (
      !recipes.some(
        (r) =>
          r.id === recipe.id ||
          r.name.trim().toLowerCase() === recipe.name.trim().toLowerCase() ||
          (!!recipe.source?.externalId &&
            r.source?.externalId === recipe.source.externalId &&
            r.source?.name === recipe.source.name),
      )
    )
      recipes.push(applyRecipeEstimates(recipe, overrides));
  return recipes;
}
