import { it, expect } from "vitest";
import { defaults, type Recipe, type Meal, type Category } from "./domain";
import {
  emptyV2,
  switchWeek,
  migrateState,
  parseBackup,
  exportBackup,
  setDayCategories,
  type State,
} from "./v2-state";
import { emptyV3 } from "./v3-state";
import { planningSettings } from "./planning-model";
import {
  preferencesFor,
  savePlanningPreferences,
  generateWeeklyPlan,
  recentDinnerIds,
  weightedRecipe,
  planningWeekStart,
} from "./weekly-planner";
import { requirements, replaceMeal, recordPurchase } from "./shopping";
import {
  confirmCooked,
  correctCookedDate,
  removeCookedEntry,
  mealHistory,
  editLegacyHistory,
} from "./meal-history";
import { updateHousehold } from "./household";
import { curatedRecipes } from "./curated-recipes";
function recipe(id: string, category: Category = "Dinner"): Recipe {
  return {
    id,
    name: "Test fixture " + id,
    category,
    servings: 2,
    prep: 5,
    cook: 10,
    diet: ["Vegan", "Vegetarian", "Dairy-free"],
    appliances: ["Hob"],
    ingredients: [
      { name: "Rice", quantity: 200, unit: "g", department: "Pantry" },
    ],
    instructions: ["Synthetic test fixture only."],
    colour: "",
    emoji: "",
    origin: "household",
  };
}
export function fixture(): State {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "fixture-store",
      chain: "IGA",
      name: "Synthetic fixture store",
      suburb: "Test",
      postcode: "4000",
      address: "",
      origin: "user",
    },
  ];
  v3.primary = "fixture-store";
  return {
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: Array.from({ length: 10 }, (_, i) => recipe("r" + i)),
    plan: [],
    checked: ["retained"],
    pantry: ["Salt"],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  };
}
const slot = (r: string, day = 0): Meal => ({
  day,
  category: "Dinner",
  recipeId: r,
  people: 2,
  appetite: 1,
  locked: false,
});
const generate = (
  s: State,
  patch: Partial<ReturnType<typeof preferencesFor>> = {},
  confirmReplace = false,
) =>
  generateWeeklyPlan(
    s,
    { ...preferencesFor(s), ...patch },
    { random: () => 0, confirmReplace },
  );
it("persists per-week and last-used preferences without mutating household settings or other weeks", () => {
  const s = fixture(),
    p = { ...preferencesFor(s), people: 4, appetite: 1.5, budget: 200 };
  const n = savePlanningPreferences(s, p);
  expect(n.settings).toEqual(s.settings);
  expect(n.v2.purchases).toEqual(s.v2.purchases);
  expect(n.v2.budgets[s.week]).toBe(200);
  expect(n.v3?.primary).toBe("fixture-store");
  expect(planningSettings(n).people).toBe(4);
  expect(preferencesFor(switchWeek(n, "2026-10-26")).people).toBe(4);
  expect(planningSettings(switchWeek(n, "2026-10-26")).people).toBe(2);
  expect(preferencesFor(parseBackup(exportBackup(n)))).toEqual(p);
  expect(
    preferencesFor({ ...s, settings: { ...s.settings, categories: [] } })
      .categories,
  ).toEqual([]);
});
it("fills selected categories, preserves daily overrides and scales/aggregates four people at 1.5 appetite", () => {
  let s = fixture();
  s.recipes = [
    ...s.recipes,
    ...Array.from({ length: 8 }, (_, i) => recipe("l" + i, "Lunch")),
  ];
  s = setDayCategories(s, 2, ["Dinner", "Lunch"]);
  const n = generate(s, { people: 4, appetite: 1.5 }).state;
  expect(n.plan).toHaveLength(8);
  expect(n.plan.filter((m) => m.category === "Lunch")).toHaveLength(1);
  expect(n.plan.every((m) => m.people === 4 && m.appetite === 1.5)).toBe(true);
  expect(requirements(n)[0].quantity).toBe(4800);
  expect(n.settings.people).toBe(2);
});
it("fills all four meal categories and uses distinct recipes before repeating", () => {
  const s = fixture();
  s.recipes = (["Breakfast", "Lunch", "Dinner", "Snacks"] as const).flatMap(
    (c) => Array.from({ length: 7 }, (_, i) => recipe(c + i, c)),
  );
  const n = generate(s, {
    categories: ["Breakfast", "Lunch", "Dinner", "Snacks"],
  });
  expect(n.state.plan).toHaveLength(28);
  expect(new Set(n.state.plan.map((m) => m.recipeId)).size).toBe(28);
  expect(n.empty).toBe(0);
});
it("never relaxes dietary, appliance, maximum-time or household allergen restrictions", () => {
  const s = fixture();
  s.v2.allergies = ["milk"];
  s.recipes = [
    { ...recipe("bad-diet"), diet: [] },
    { ...recipe("bad-appliance"), appliances: ["Oven"] },
    { ...recipe("bad-time"), cook: 100 },
    { ...recipe("bad-allergen"), allergens: ["milk"] },
  ];
  const n = generate(s, { diet: ["Vegan"], appliances: ["Hob"], maxTime: 20 });
  expect(n.empty).toBe(7);
  expect(n.state.plan.every((m) => m.recipeId === null)).toBe(true);
  expect(n.warnings.join(" ")).toContain("restrictions were kept");
});
it("avoids dinners planned within 21 days and relaxes cooldown before leaving empty slots", () => {
  const s = fixture();
  s.v2.weeks["2026-10-12"] = { plan: [slot("r0")], checked: [] };
  expect(recentDinnerIds(s).has("r0")).toBe(true);
  expect(recentDinnerIds({ ...s, week: "2026-11-02" }).has("r0")).toBe(false);
  expect(generate(s).state.plan.some((m) => m.recipeId === "r0")).toBe(false);
  s.recipes = s.recipes.slice(0, 7);
  s.v2.weeks["2026-10-12"].plan = s.recipes.map((r, day) => slot(r.id, day));
  const n = generate(s);
  expect(n.empty).toBe(0);
  expect(new Set(n.state.plan.map((m) => m.recipeId)).size).toBe(7);
  expect(n.warnings.join(" ")).toContain("cooldown was relaxed");
});
it("gives favourites a boost without forcing inclusion or weekly duplication", () => {
  const favourite = { ...recipe("f"), favourite: true },
    normal = recipe("n");
  let count = 0;
  for (let i = 0; i < 100; i++)
    if (
      weightedRecipe([{ r: favourite }, { r: normal }], () => i / 100)?.r.id ===
      "f"
    )
      count++;
  expect(count).toBe(75);
  expect(
    weightedRecipe([{ r: favourite }, { r: normal }], () => 0.99)?.r.id,
  ).toBe("n");
  const s = fixture();
  s.recipes[0].favourite = true;
  const n = generate(s);
  expect(n.state.plan.filter((m) => m.recipeId === "r0")).toHaveLength(1);
});
it("places fixed repeats first and weekly random repeats into free slots of their category", () => {
  const s = fixture();
  s.recipes[0].repeat = { mode: "weekly-fixed", day: 3 };
  s.recipes[1].repeat = { mode: "weekly-random" };
  s.recipes[1].favourite = false;
  const n = generate(s);
  expect(n.conflicts).toEqual([]);
  expect(n.state.plan.find((m) => m.day === 3)?.recipeId).toBe("r0");
  expect(n.state.plan.filter((m) => m.recipeId === "r1")).toHaveLength(1);
  expect(n.state.plan.find((m) => m.recipeId === "r1")?.category).toBe(
    "Dinner",
  );
});
it("reports competing fixed recipes, blocked locks and disabled categories without changing a plan", () => {
  const s = fixture();
  s.recipes[0].repeat = { mode: "weekly-fixed", day: 0 };
  s.recipes[1].repeat = { mode: "weekly-fixed", day: 0 };
  const conflict = generate(s);
  expect(conflict.conflicts[0].recipeIds).toEqual(["r0", "r1"]);
  expect(conflict.state).toBe(s);
  s.recipes[1].repeat = { mode: "normal" };
  s.plan = [{ ...slot("r2"), locked: true }];
  expect(generate(s).conflicts[0].message).toContain("locked");
  s.plan = [];
  const disabled = setDayCategories(s, 0, []);
  expect(generate(disabled).conflicts[0].message).toContain("disabled");
});
it("weekly repeats cannot bypass hard restrictions or create duplicate locked meals", () => {
  const s = fixture();
  s.recipes[0].repeat = { mode: "weekly-fixed", day: 2 };
  s.recipes[0].diet = [];
  expect(generate(s, { diet: ["Vegan"] }).conflicts).toHaveLength(1);
  s.recipes[0].diet = ["Vegan"];
  s.plan = [{ ...slot("r0", 0), locked: true }];
  expect(generate(s, { diet: ["Vegan"] }).conflicts[0].message).toContain(
    "already protected",
  );
});
it("requires confirmation to replace an existing week and preserves locked, cooked and custom meals", () => {
  const s = fixture();
  s.plan = [
    { ...slot("r0"), locked: true },
    { ...slot("r1", 1), cooked: true },
    { ...slot("r2", 2), people: 3, appetite: 2, portionOverride: true },
    slot("r3", 3),
  ];
  expect(() => generate(s)).toThrow("Confirm replacing");
  const n = generate(s, { people: 4, appetite: 1.5 }, true).state;
  expect(n.plan[0]).toEqual(s.plan[0]);
  expect(n.plan[1]).toEqual(s.plan[1]);
  expect(n.plan.find((m) => m.day === 2)).toMatchObject({
    people: 3,
    appetite: 2,
    portionOverride: true,
  });
  expect(n.plan.find((m) => m.day === 3)).toMatchObject({
    people: 4,
    appetite: 1.5,
    portionOverride: false,
  });
});
it("individual swaps respect weekly preferences and keep portions, purchases and unrelated slots", () => {
  let s = fixture();
  s = generate(s, { people: 4, appetite: 1.5 }).state;
  const meal = s.plan[0];
  const replacement = s.recipes.find(
    (r) => !s.plan.some((m) => m.recipeId === r.id),
  )!;
  const n = replaceMeal(s, meal, replacement);
  expect(n.plan.slice(1)).toEqual(s.plan.slice(1));
  expect(n.plan[0]).toMatchObject({
    recipeId: replacement.id,
    people: 4,
    appetite: 1.5,
  });
  expect(requirements(n)[0].quantity).toBe(4200);
  expect(() =>
    replaceMeal(
      { ...s, plan: [{ ...meal, locked: true }] },
      { ...meal, locked: true },
      replacement,
    ),
  ).toThrow("locked");
});
it("history never infers cooking from dates, supports explicit confirmation and date correction/removal", () => {
  const s = fixture();
  s.plan = [slot("r0")];
  expect(mealHistory(s)[0].status).toBe("planned");
  const n = confirmCooked(s, s.week, s.plan[0], "2026-10-19");
  expect(mealHistory(n)[0]).toMatchObject({
    status: "cooked",
    date: "2026-10-19",
  });
  expect(n.v2.stock).toEqual(s.v2.stock);
  expect(requirements(n)).toEqual([]);
  const corrected = correctCookedDate(n, mealHistory(n)[0].id, "2026-10-20");
  expect(mealHistory(corrected)[0].date).toBe("2026-10-20");
  const removed = removeCookedEntry(corrected, mealHistory(corrected)[0].id);
  expect(removed.plan[0].cooked).toBe(false);
  expect(mealHistory(removed)[0].status).toBe("planned");
  expect(requirements(removed)[0].quantity).toBe(200);
  expect(() => confirmCooked(s, s.week, s.plan[0], "2026-02-31")).toThrow();
});
it("cooking consumption ledger can restore exact stock without deleting recorded purchases", () => {
  let s = fixture();
  s.plan = [slot("r0")];
  s = recordPurchase(
    s,
    { ...s.recipes[0].ingredients[0], key: "rice|g" },
    500,
    4,
  );
  const n = confirmCooked(s, s.week, s.plan[0], "2026-10-19", true);
  expect(n.v2.purchases[0].consumed).toBe(200);
  expect(n.planning?.history[0].purchaseDeltas?.[s.v2.purchases[0].id]).toBe(
    200,
  );
  const undo = removeCookedEntry(n, n.planning!.history[0].id);
  expect(undo.v2.purchases).toEqual(s.v2.purchases);
  expect(undo.checked).toEqual(s.checked);
});
it("legacy cooking dates remain unknown until corrected, with stock left unchanged", () => {
  const s = fixture();
  s.plan = [{ ...slot("r0"), cooked: true }];
  const row = mealHistory(s)[0];
  expect(row.status).toBe("legacy");
  const corrected = editLegacyHistory(s, row, "2026-10-20");
  expect(mealHistory(corrected)[0].status).toBe("cooked");
  expect(corrected.v2).toEqual(s.v2);
});
it("migration and backups preserve prior recipes, stores, inventory, dates and new scheduling preferences", () => {
  const s = fixture();
  s.recipes[0].favourite = true;
  s.recipes[0].repeat = { mode: "weekly-fixed", day: 4 };
  const n = generate(s).state;
  const restored = parseBackup(exportBackup(n));
  expect(restored.planning).toEqual(n.planning);
  expect(restored.recipes).toEqual(n.recipes);
  expect(restored.v3).toEqual(n.v3);
  expect(migrateState(s).settings).toEqual(s.settings);
  const updated = updateHousehold(n, 5, 2, "defaults");
  expect(updated.plan.every((m) => m.people === 5)).toBe(true);
  expect(updated.planning?.weeks[s.week].people).toBe(5);
});
it("uses the genuine recipe collection for seven distinct dinners without modifying its recipes", () => {
  const s = fixture();
  s.recipes = curatedRecipes;
  const n = generate(s, {
    maxTime: 90,
    appliances: ["Hob", "Oven", "Fan-forced oven", "BBQ"],
  });
  expect(n.empty).toBe(0);
  expect(new Set(n.state.plan.map((m) => m.recipeId)).size).toBe(7);
  expect(n.state.recipes).toBe(curatedRecipes);
});
it("normalises week selection to Monday and preserves existing non-Monday plans rather than shifting them", () => {
  expect(planningWeekStart("2026-10-21")).toBe("2026-10-19");
  expect(() => generate({ ...fixture(), week: "2026-10-21" })).toThrow(
    "Monday",
  );
});
it("keeps protected meals but warns when a locked recipe conflicts with new hard restrictions", () => {
  const s = fixture();
  s.recipes[0].diet = [];
  s.plan = [{ ...slot("r0"), locked: true }];
  const n = generate(s, { diet: ["Vegan"] });
  expect(n.state.plan[0].recipeId).toBe("r0");
  expect(n.warnings.join(" ")).toContain("locked meal does not match");
  expect(n.state.plan.slice(1).every((m) => m.recipeId !== "r0")).toBe(true);
});
it("applies random weekly repeats to lunch slots only and reports unavailable weekly categories", () => {
  const s = fixture();
  s.recipes.push({
    ...recipe("lunch", "Lunch"),
    repeat: { mode: "weekly-random" },
  });
  expect(generate(s).conflicts[0].message).toContain("no eligible free Lunch");
  const n = generate(s, { categories: ["Dinner", "Lunch"] });
  expect(n.conflicts).toHaveLength(0);
  expect(n.state.plan.find((m) => m.recipeId === "lunch")?.category).toBe(
    "Lunch",
  );
});
