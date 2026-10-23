import { starterRecipes } from "./recipes";
import type { Recipe } from "./domain";
export function artificialRecipe(r: Recipe) {
  return (
    r.origin === "mechanical" ||
    (r.id.startsWith("original-v2-") &&
      r.source?.name === "MealMate original variations")
  );
}
export function discoverable(r: Recipe) {
  return !r.archived && !artificialRecipe(r) && r.origin !== "ai";
}
export function legacyAIStarter(r: Recipe) {
  const original = starterRecipes.find((s) => s.id === r.id);
  return (
    !!original &&
    r.name === original.name &&
    JSON.stringify(r.ingredients) === JSON.stringify(original.ingredients) &&
    JSON.stringify(r.instructions) === JSON.stringify(original.instructions)
  );
}
export function archiveVariations(recipes: Recipe[]) {
  return recipes.map((r) =>
    artificialRecipe(r)
      ? { ...r, archived: true, origin: "mechanical" as const }
      : legacyAIStarter(r)
        ? { ...r, archived: true, origin: "ai" as const }
        : r,
  );
}
