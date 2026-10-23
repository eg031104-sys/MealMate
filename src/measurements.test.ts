import { it, expect } from "vitest";
import { approximateMeasure, applyRecipeEstimates } from "./measurements";
import {
  defaults,
  scaleQuantity,
  shoppingList,
  usable,
  type Ingredient,
  type Recipe,
} from "./domain";
import { normaliseRecipe } from "./recipe-import";
import { migrateState, emptyV2 } from "./v2-state";
const ingredient = (name: string, measure: string) =>
  ({
    name,
    department: "Fruit & veg",
    ...approximateMeasure(name, measure),
  }) as Ingredient;
const recipe: Recipe = {
  id: "fixture-measured",
  name: "Synthetic test fixture",
  origin: "household",
  category: "Lunch",
  servings: 2,
  prep: 5,
  cook: 5,
  appliances: ["Hob"],
  diet: [],
  emoji: "",
  colour: "",
  instructions: ["Synthetic fixture instruction"],
  ingredients: [
    ingredient("Spinach", "2 handfuls"),
    ingredient("Salt", "to taste"),
  ],
};
it("uses ingredient-aware defaults, not a universal handful mass", () => {
  expect(ingredient("Spinach", "2 handfuls")).toMatchObject({
    quantity: 60,
    unit: "g",
    approximate: true,
    rawMeasure: "2 handfuls",
  });
  expect(ingredient("Parsley", "2 handfuls").quantity).toBe(30);
  expect(ingredient("Almonds", "1 handful").quantity).toBe(30);
  expect(approximateMeasure("Unknown food", "1 handful")).toBeUndefined();
  expect(ingredient("Salt", "1 pinch").quantity).toBe(0.3);
  expect(ingredient("Olive oil", "1 splash")).toMatchObject({
    quantity: 5,
    unit: "ml",
  });
});
it("scales two handfuls of spinach for four people and 1.5 appetite to approximately 180 g", () => {
  expect(scaleQuantity(recipe.ingredients[0].quantity, 2, 4, 1.5)).toBe(180);
  const result = shoppingList(
    [
      {
        day: 0,
        category: "Lunch",
        recipeId: recipe.id,
        people: 4,
        appetite: 1.5,
        locked: false,
      },
    ],
    [recipe],
    ["Lunch"],
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    quantity: 180,
    approximate: true,
    unit: "g",
  });
});
it("retains to-taste ingredients while excluding them from exact shopping quantities", () => {
  expect(usable(recipe)).toBe(true);
  expect(normaliseRecipe(recipe).review).toEqual([]);
  expect(usable({ ...recipe, ingredients: [recipe.ingredients[1]] })).toBe(
    false,
  );
  const estimated = applyRecipeEstimates(recipe, {
    "salt|to taste": { quantity: 0.6, unit: "g" },
  });
  expect(estimated.ingredients[1]).toMatchObject({
    quantity: 0.6,
    approximate: true,
    excludeFromShopping: false,
    rawMeasure: "to taste",
  });
});
it("aggregates exact and approximate ingredients without losing approximate status", () => {
  const exact = {
    ...recipe,
    id: "exact",
    ingredients: [
      {
        name: "Spinach",
        quantity: 40,
        unit: "g",
        department: "Fruit & veg",
      } as Ingredient,
    ],
  };
  const result = shoppingList(
    [
      {
        day: 0,
        category: "Lunch",
        recipeId: recipe.id,
        people: 2,
        appetite: 1,
        locked: false,
      },
      {
        day: 1,
        category: "Lunch",
        recipeId: exact.id,
        people: 2,
        appetite: 1,
        locked: false,
      },
    ],
    [recipe, exact],
    ["Lunch"],
  );
  expect(result[0]).toMatchObject({ quantity: 100, approximate: true });
});
it("validates additive settings and ingredient metadata without changing previous household records", () => {
  const raw = {
    settings: {
      ...defaults,
      measurementOverrides: { "spinach|handful": { quantity: 40, unit: "g" } },
    },
    recipes: [recipe],
    plan: [],
    checked: [],
    pantry: ["Salt"],
    week: "2026-10-19",
    v2: emptyV2(),
  };
  const next = migrateState(raw);
  expect(next.recipes).toEqual(raw.recipes);
  expect(next.v2).toEqual(raw.v2);
  expect(next.settings).toEqual(raw.settings);
  expect(
    applyRecipeEstimates(recipe, next.settings.measurementOverrides)
      .ingredients[0].quantity,
  ).toBe(80);
  expect(() =>
    migrateState({
      ...raw,
      settings: {
        ...raw.settings,
        measurementOverrides: { "salt|pinch": { quantity: -1, unit: "g" } },
      },
    }),
  ).toThrow();
});
