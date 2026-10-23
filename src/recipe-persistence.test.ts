import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { loadState, saveState } from "./storage";
import { defaults } from "./domain";
import { emptyV2 } from "./v2-state";
import { emptyV3 } from "./v3-state";
import { curatedRecipes } from "./curated-recipes";
import { upgradeCatalogue } from "./genuine-recipes";
it("persists added recipes and conversion settings alongside all existing household data through reopen", async () => {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "fixture",
      name: "Fixture only",
      chain: "IGA",
      address: "",
      suburb: "Fixture",
      postcode: "4000",
      origin: "user",
    },
  ];
  v3.primary = "fixture";
  const original = {
    settings: {
      ...defaults,
      people: 4,
      appetite: 1.5,
      measurementOverrides: {
        "spinach|handful": { quantity: 40, unit: "g" as const },
      },
    },
    recipes: [
      {
        ...curatedRecipes[0],
        name: "Edited saved title",
        archived: true,
        favourite: true,
      },
    ],
    plan: [
      {
        day: 0,
        category: "Dinner" as const,
        recipeId: curatedRecipes[0].id,
        people: 3,
        appetite: 2,
        locked: true,
      },
    ],
    checked: ["saved-check"],
    pantry: ["Salt"],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  };
  original.v2.stock = {
    "rice|g": {
      name: "Rice",
      quantity: 1000,
      unit: "g",
      department: "Pantry & grains",
      consumed: 0,
      prepared: false,
    },
  };
  await saveState(original);
  const before = (await loadState())!;
  await saveState({
    ...before,
    recipes: upgradeCatalogue(
      before.recipes,
      before.settings.measurementOverrides,
    ),
  });
  const after = (await loadState())!;
  expect(after.settings).toEqual(before.settings);
  expect(after.plan).toEqual(before.plan);
  expect(after.v2).toEqual(before.v2);
  expect(after.v3).toEqual(before.v3);
  expect(after.pantry).toEqual(before.pantry);
  expect(after.checked).toEqual(before.checked);
  expect(after.recipes.find((r) => r.id === curatedRecipes[0].id)).toEqual(
    before.recipes[0],
  );
  expect(after.recipes).toHaveLength(85);
  expect(
    after.recipes
      .find((r) => r.id === "pdr-omelet")
      ?.ingredients.find((i) => i.name === "egg")?.quantity,
  ).toBe(4);
});
