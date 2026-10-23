import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { saveState, loadState } from "./storage";
import { defaults } from "./domain";
import { emptyV2, exportBackup, parseBackup } from "./v2-state";
import { emptyV3 } from "./v3-state";
import { curatedRecipes } from "./curated-recipes";
import { generateWeeklyPlan, preferencesFor } from "./weekly-planner";
import { confirmCooked } from "./meal-history";
it("persists planning preferences, favourites, repeats and confirmed history without replacing previous data", async () => {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "fixture",
      chain: "IGA",
      name: "Synthetic fixture",
      address: "",
      suburb: "Test",
      postcode: "4000",
      origin: "user",
    },
  ];
  v3.primary = "fixture";
  const v2 = emptyV2();
  v2.stock = {
    "rice|g": {
      name: "Rice",
      unit: "g",
      department: "Pantry",
      quantity: 1000,
      consumed: 0,
      prepared: false,
    },
  };
  await saveState({
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: curatedRecipes,
    plan: [],
    checked: ["keep"],
    pantry: ["Salt"],
    week: "2026-10-19",
    v2,
    v3,
  });
  const before = (await loadState())!;
  const repeat = before.recipes.find(
    (r) =>
      r.category === "Dinner" &&
      r.appliances.includes("Hob") &&
      r.prep + r.cook + (r.wait ?? 0) <= 60,
  )!;
  before.recipes = before.recipes.map((r) =>
    r.id === repeat.id
      ? { ...r, favourite: true, repeat: { mode: "weekly-fixed", day: 2 } }
      : r,
  );
  const result = generateWeeklyPlan(
    before,
    { ...preferencesFor(before), people: 4, appetite: 1.5 },
    { random: () => 0 },
  );
  expect(result.conflicts).toEqual([]);
  const cooked = confirmCooked(
    result.state,
    before.week,
    result.state.plan[0],
    "2026-10-19",
  );
  await saveState(cooked);
  const after = (await loadState())!;
  expect(after.planning).toEqual(cooked.planning);
  expect(after.settings).toEqual(before.settings);
  expect(after.v2.stock).toEqual(before.v2.stock);
  expect(after.v2.purchases).toEqual(before.v2.purchases);
  expect(after.pantry).toEqual(before.pantry);
  expect(after.checked).toEqual(before.checked);
  expect(after.v3?.stores).toEqual(before.v3?.stores);
  expect(after.recipes.find((r) => r.id === repeat.id)?.repeat).toEqual({
    mode: "weekly-fixed",
    day: 2,
  });
  expect(parseBackup(exportBackup(after)).planning).toEqual(after.planning);
  const duplicate = {
    ...after,
    planning: {
      ...after.planning!,
      history: [...after.planning!.history, ...after.planning!.history],
    },
  };
  expect(() => parseBackup(exportBackup(duplicate))).toThrow(
    "Duplicate cooking history",
  );
});
