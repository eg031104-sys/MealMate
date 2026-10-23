import type { Recipe, Meal, Ingredient } from "./domain";
import { matches, scaleQuantity, shoppingList } from "./domain";
import {
  requirements,
  inventory,
  today,
  consumeMeal,
  available,
} from "./shopping";
import { itemKey } from "./v2-state";
import type { State } from "./v2-state";
import { discoverable } from "./catalogue";
import { supermarketData } from "./supermarkets";
export type Suggestion = {
  recipe: Recipe;
  people: number;
  uses: string[];
  additional: number;
  urgent: boolean;
  usedQuantities: Ingredient[];
  additionalIngredients: Ingredient[];
  minutes: number;
};
export interface RecipeSuggestionProvider {
  id: string;
  label: string;
  suggest(state: State, people: number): Promise<Suggestion[]>;
}
export interface SnackGenerationProvider {
  id: string;
  configured: boolean;
  generate(context: {
    state: State;
    people: number;
    surplus: Ingredient[];
  }): Promise<Recipe>;
} // Backend-only implementations must return reviewable drafts. No keys are accepted here.
export const aiSnackProvider: SnackGenerationProvider | null = null;
export function canOfferAI(
  matches: Suggestion[],
  provider: SnackGenerationProvider | null,
) {
  return matches.length === 0 && provider?.configured === true;
}
export function leftoverSurplus(
  state: State,
  key: string,
  required = requirements(state).find((i) => i.key === key)?.quantity ?? 0,
) {
  if (!state.v3) return inventory(state, key, required).available;
  const name = key.split("|")[0];
  const highRisk =
    /chicken|beef|pork|lamb|veal|fish|salmon|tuna|prawn|crab|milk|yoghurt|yogurt|cream|egg/.test(
      name,
    );
  if (!highRisk || key.endsWith("|prepared"))
    return inventory(state, key, required).available;
  const baseKey = key.replace(/\|prepared$/, "");
  const stock = { ...state.v2.stock };
  if (stock[baseKey] && !stock[baseKey].expiry) delete stock[baseKey];
  const verified = {
    ...state,
    v2: {
      ...state.v2,
      stock,
      purchases: state.v2.purchases.filter(
        (p) => p.key !== baseKey || !!p.expiry,
      ),
    },
  };
  return Math.max(0, available(verified, key) - required);
}
export function librarySuggestions(
  state: State,
  people = state.settings.people,
): Suggestion[] {
  const required = requirements(state);
  return state.recipes
    .filter(
      (r) =>
        discoverable(r) &&
        ["Snacks", "Sides", "Lunch"].includes(r.category) &&
        matches(r, state.settings) &&
        !state.v2.allergies.some(
          (a) =>
            r.ingredients.some((i) =>
              i.name.toLowerCase().includes(a.toLowerCase()),
            ) ||
            (r.allergens ?? []).some((allergen) =>
              allergen.toLowerCase().includes(a.toLowerCase()),
            ),
        ),
    )
    .map((recipe) => {
      const usedQuantities: Ingredient[] = [],
        additionalIngredients: Ingredient[] = [];
      let urgent = false;
      for (const original of recipe.ingredients) {
        const i = {
          ...original,
          prepared:
            recipe.preparedIngredients?.includes(original.name) ||
            original.prepared,
        };
        const key = itemKey(i),
          needed = scaleQuantity(
            i.quantity,
            recipe.servings,
            people,
            state.settings.appetite,
          );
        const free = leftoverSurplus(
          state,
          key,
          required.find((r) => r.key === key)?.quantity ?? 0,
        );
        const used = Math.min(needed, free);
        if (used > 0) {
          usedQuantities.push({ ...i, quantity: used });
          const baseKey = key.replace(/\|prepared$/, "");
          const dates = [
            ...state.v2.purchases
              .filter(
                (p) =>
                  (p.key === key || p.key === baseKey) &&
                  p.prepared === !!i.prepared &&
                  p.quantity > p.consumed,
              )
              .map((p) => p.expiry),
            state.v2.stock[baseKey]?.expiry,
          ].filter((d): d is string => !!d && d >= today());
          urgent ||= dates.some(
            (d) => Date.parse(d) - Date.parse(today()) <= 2 * 86400000,
          );
        }
        if (needed > used)
          additionalIngredients.push({ ...i, quantity: needed - used });
      }
      return {
        recipe,
        people,
        uses: usedQuantities.map((i) => i.name),
        additional: additionalIngredients.length,
        urgent,
        usedQuantities,
        additionalIngredients,
        minutes: recipe.prep + recipe.cook + (recipe.wait ?? 0),
      };
    })
    .filter((s) => s.uses.length > 0)
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        a.additional - b.additional ||
        b.uses.length - a.uses.length ||
        Number(b.recipe.origin === "external") -
          Number(a.recipe.origin === "external"),
    )
    .slice(0, 8);
}
export const libraryProvider: RecipeSuggestionProvider = {
  id: "local-library",
  label: "Existing recipes first — no AI provider configured",
  async suggest(state, people) {
    return librarySuggestions(state, people);
  },
};
export function addSuggestion(
  state: State,
  suggestion: Suggestion,
  day: number,
): State {
  const category = suggestion.recipe.category;
  const old = state.plan.find((m) => m.day === day && m.category === category);
  if (old?.locked)
    throw Error(
      "This slot is locked. Unlock it in the planner before replacing it.",
    );
  const meal: Meal = {
    day,
    category,
    recipeId: suggestion.recipe.id,
    people: suggestion.people,
    appetite: state.settings.appetite,
    locked: false,
    portionOverride: suggestion.people !== state.settings.people,
  };
  return {
    ...state,
    plan: state.plan
      .filter((m) => m.day !== day || m.category !== category)
      .concat(meal),
  };
}
export function prepareIndependently(
  state: State,
  suggestion: Suggestion,
): State {
  if (
    !matches(suggestion.recipe, state.settings) ||
    state.v2.allergies.some(
      (a) =>
        suggestion.recipe.ingredients.some((i) =>
          i.name.toLowerCase().includes(a.toLowerCase()),
        ) ||
        (suggestion.recipe.allergens ?? []).some((x) =>
          x.toLowerCase().includes(a.toLowerCase()),
        ),
    )
  )
    throw Error("Recipe does not match current preferences.");
  const meal: Meal = {
    day: 0,
    category: suggestion.recipe.category,
    recipeId: suggestion.recipe.id,
    people: suggestion.people,
    appetite: state.settings.appetite,
    locked: false,
  };
  const needs = shoppingList([meal], state.recipes, [meal.category]);
  for (const i of needs)
    if (leftoverSurplus(state, i.key) + 1e-8 < i.quantity)
      throw Error(
        `Not enough unreserved ${i.name}. Buy the additional ingredients or correct stock first.`,
      );
  const consumed = consumeMeal({ ...state, plan: [meal] }, meal);
  const data = supermarketData(state);
  return {
    ...state,
    v2: consumed.v2,
    v3: {
      ...data,
      independentMeals: [
        ...data.independentMeals,
        {
          id: crypto.randomUUID(),
          recipeId: suggestion.recipe.id,
          at: new Date().toISOString(),
          people: suggestion.people,
          appetite: state.settings.appetite,
        },
      ],
    },
  };
}
