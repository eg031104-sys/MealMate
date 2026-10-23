import type { Recipe, Meal } from "./domain";
import { matches, scaleQuantity } from "./domain";
import { available, requirements, inventory, today } from "./shopping";
import { itemKey } from "./v2-state";
import type { State } from "./v2-state";
export type Suggestion = {
  recipe: Recipe;
  people: number;
  uses: string[];
  additional: number;
  urgent: boolean;
};
export interface RecipeSuggestionProvider {
  id: string;
  label: string;
  suggest(state: State, people: number): Promise<Suggestion[]>;
}
export function librarySuggestions(
  state: State,
  people = state.settings.people,
): Suggestion[] {
  const required = requirements(state);
  const keys = new Set([
    ...Object.keys(state.v2.stock),
    ...state.v2.purchases.map((p) => p.key),
  ]);
  const surplus = new Map(
    [...keys].map((key) => [
      key,
      inventory(state, key, required.find((i) => i.key === key)?.quantity ?? 0)
        .available,
    ]),
  );
  return state.recipes
    .filter(
      (r) =>
        ["Snacks", "Sides", "Lunch"].includes(r.category) &&
        matches(r, state.settings) &&
        !state.v2.allergies.some((a) =>
          r.ingredients.some((i) =>
            i.name.toLowerCase().includes(a.toLowerCase()),
          ),
        ),
    )
    .map((recipe) => {
      const uses: string[] = [];
      let additional = 0,
        urgent = false;
      for (const i of recipe.ingredients) {
        const key = itemKey(i);
        const needed = scaleQuantity(
          i.quantity,
          recipe.servings,
          people,
          state.settings.appetite,
        );
        const free = surplus.get(key) ?? 0;
        if (free > 0) {
          const lots = state.v2.purchases.filter(
            (p) => p.key === key && p.quantity > p.consumed,
          );
          const stock = state.v2.stock[key];
          const prepared = lots.some((p) => p.prepared) || stock?.prepared; // Conservative: never treat cooked stock as raw ingredients.
          if (!prepared) {
            uses.push(i.name);
            const expiry = [...lots.map((p) => p.expiry), stock?.expiry]
              .filter((d): d is string => !!d)
              .sort()[0];
            urgent ||=
              !!expiry &&
              expiry >= today() &&
              Date.parse(expiry) - Date.parse(today()) <= 2 * 86400000;
          } else additional++;
        } else additional++;
        if (free > 0 && free < needed) additional++;
      }
      return { recipe, people, uses, additional, urgent };
    })
    .filter((s) => s.uses.length > 0)
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        a.additional - b.additional ||
        b.uses.length - a.uses.length,
    )
    .slice(0, 8);
}
export const libraryProvider: RecipeSuggestionProvider = {
  id: "local-library",
  label: "Local recipe suggestions — no AI provider configured",
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
  };
  return {
    ...state,
    plan: state.plan
      .filter((m) => m.day !== day || m.category !== category)
      .concat(meal),
  };
}
