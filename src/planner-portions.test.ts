import { curatedRecipes } from "./curated-recipes";
import { it, expect } from "vitest";
import type { Category } from "./domain";
import { shoppingFixture } from "./shopping-test-fixture";
import {
  generateWeeklyPlan,
  preferencesFor,
  savePlanningPreferences,
} from "./weekly-planner";
import {
  requirements,
  replaceMeal,
  recommendation,
  budget,
  pantryStatus,
  recordPurchase,
  smartGenerate,
} from "./shopping";
import { migrateState, parseBackup, exportBackup } from "./v2-state";
const categories: Array<"Breakfast" | "Lunch" | "Dinner" | "Snacks"> = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
];
function fixture() {
  const s = shoppingFixture();
  s.plan = [];
  s.settings = { ...s.settings, people: 2, appetite: 1 };
  const template = s.recipes[0];
  s.recipes = categories.flatMap((category) =>
    Array.from({ length: 8 }, (_, i) => {
      const servings = [2, 3, 4, 6][i % 4];
      return {
        ...template,
        id: `${category}-${i}`,
        category,
        servings,
        ingredients: [
          {
            name: "Rice",
            quantity: 20 * servings,
            unit: "g" as const,
            department: "Pantry",
          },
        ],
      };
    }),
  );
  return s;
}
function generate(s = fixture(), people = 4, appetite = 1.25) {
  return generateWeeklyPlan(
    s,
    { ...preferencesFor(s), people, appetite, categories },
    { confirmReplace: true, random: () => 0 },
  ).state;
}
it.each(
  [2, 4, 6].flatMap((people) =>
    [1, 1.25].map((appetite) => ({ people, appetite })),
  ),
)(
  "generates every category for $people people at $appetite appetite using original recipe yields",
  ({ people, appetite }) => {
    const s = generate(fixture(), people, appetite);
    expect(s.plan).toHaveLength(28);
    expect(
      s.plan.every(
        (m) =>
          m.people === people &&
          m.appetite === appetite &&
          m.portionOverride === false,
      ),
    ).toBe(true);
    for (const category of categories)
      expect(
        s.plan.filter((m) => m.category === category && m.recipeId),
      ).toHaveLength(7);
    const items = requirements(s);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(28 * 20 * people * appetite);
    expect(pantryStatus(s, items[0]).required).toBe(items[0].quantity);
    const rec = recommendation(s, items[0]);
    expect(rec.packs).toBe(Math.ceil(items[0].quantity / 1000));
    expect(budget(s).total).toBe(rec.packs * 3);
    expect(s.settings.people).toBe(2);
    expect(s.settings.appetite).toBe(1);
  },
);
it("reproduces stale saved 2-person slots with previously saved 4-person preferences and corrects only regenerated slots", () => {
  let s = savePlanningPreferences(fixture(), {
    ...preferencesFor(fixture()),
    people: 4,
    appetite: 1.25,
    categories,
  });
  s.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: "Dinner-0",
      people: 2,
      appetite: 1,
      locked: false,
    },
  ];
  const reopened = migrateState(s);
  expect(reopened.plan[0].people).toBe(2); // A read is not consent to modify saved choices.
  const n = generate(reopened);
  expect(n.plan.every((m) => m.people === 4 && m.appetite === 1.25)).toBe(true);
  expect(requirements(n)[0].quantity).toBe(2800);
});
it("preserves explicit overrides (even if matching the former defaults), locks, cooked meals and purchases", () => {
  let s = generate();
  const meal = (day: number, category: Category) =>
    s.plan.find((m) => m.day === day && m.category === category)!;
  meal(0, "Dinner").locked = true;
  meal(0, "Dinner").people = 2;
  meal(1, "Lunch").cooked = true;
  meal(1, "Lunch").people = 3;
  meal(2, "Breakfast").portionOverride = true;
  meal(2, "Breakfast").people = 4;
  meal(3, "Snacks").portionOverride = true;
  meal(3, "Snacks").people = 1;
  meal(3, "Snacks").appetite = 2;
  s = recordPurchase(s, requirements(s)[0], 1000, 5);
  const saved = structuredClone(s);
  const n = generate(s, 6, 1);
  for (const [day, category] of [
    [0, "Dinner"],
    [1, "Lunch"],
    [2, "Breakfast"],
    [3, "Snacks"],
  ] as const) {
    const original = saved.plan.find(
      (m) => m.day === day && m.category === category,
    )!;
    const actual = n.plan.find(
      (m) => m.day === day && m.category === category,
    )!;
    if (original.locked || original.cooked) expect(actual).toEqual(original);
    else
      expect(actual).toMatchObject({
        people: original.people,
        appetite: original.appetite,
        portionOverride: true,
      });
  }
  expect(
    n.plan
      .filter((m) => !m.locked && !m.cooked && !m.portionOverride)
      .every((m) => m.people === 6 && m.appetite === 1),
  ).toBe(true);
  expect(n.v2.purchases).toEqual(saved.v2.purchases);
  expect(parseBackup(exportBackup(n)).plan).toEqual(n.plan);
});
it("single meal replacement inherits current weekly portions unless explicitly overridden", () => {
  let s = generate();
  const old = {
    ...s.plan.find((m) => m.category === "Dinner")!,
    people: 2,
    appetite: 1,
    portionOverride: undefined,
  };
  s.plan = s.plan.map((m) =>
    m.day === old.day && m.category === old.category ? old : m,
  );
  const replacement = s.recipes.find((r) => r.id === "Dinner-7")!;
  const before = requirements(s)[0].quantity;
  const n = replaceMeal(s, old, replacement);
  const changed = n.plan.find(
    (m) => m.day === old.day && m.category === old.category,
  )!;
  expect(changed).toMatchObject({
    people: 4,
    appetite: 1.25,
    portionOverride: false,
  });
  expect(requirements(n)[0].quantity - before).toBe(60);
  const custom = { ...old, people: 6, appetite: 1.25, portionOverride: true };
  s.plan = s.plan.map((m) =>
    m.day === old.day && m.category === old.category ? custom : m,
  );
  expect(
    replaceMeal(s, custom, replacement).plan.find(
      (m) => m.day === old.day && m.category === old.category,
    ),
  ).toMatchObject({ people: 6, appetite: 1.25, portionOverride: true });
});
it("an explicit meal edit immediately rescales shopping, pantry shortage, packs and budget", () => {
  const s = generate(fixture(), 2, 1),
    before = requirements(s)[0].quantity;
  const slot = s.plan[0];
  s.plan[0] = { ...slot, people: 6, appetite: 1.25, portionOverride: true };
  const item = requirements(s)[0];
  expect(item.quantity - before).toBe(110);
  expect(recommendation(s, item).shortage).toBe(item.quantity);
  expect(budget(s).total).toBe(Math.ceil(item.quantity / 1000) * 3);
});
it("legacy generation entry point uses saved weekly settings rather than stale global household counts", () => {
  let s = savePlanningPreferences(fixture(), {
    ...preferencesFor(fixture()),
    people: 6,
    appetite: 1.25,
    categories,
  });
  s = smartGenerate(s);
  expect(s.plan).toHaveLength(28);
  expect(s.plan.every((m) => m.people === 6 && m.appetite === 1.25)).toBe(true);
});

it("scales the reported Shrimp Fettuccine Alfredo recipe to five standard portions using its own yield", () => {
  const s = fixture();
  const r = curatedRecipes.find(
    (r) => r.id === "pdr-shrimp-fettuccine-alfredo",
  )!;
  expect(r).toBeTruthy();
  s.recipes = [r];
  s.settings = {
    ...s.settings,
    appliances: [...s.settings.appliances, ...r.appliances],
    maxTime: 1000,
  };
  const n = generateWeeklyPlan(
    s,
    { ...preferencesFor(s), people: 4, appetite: 1.25, categories: ["Dinner"] },
    { random: () => 0 },
  ).state;
  const meal = n.plan[0];
  expect(meal).toMatchObject({ recipeId: r.id, people: 4, appetite: 1.25 });
  const single = requirements({ ...n, plan: [meal] });
  for (const ingredient of r.ingredients.filter(
    (i) => !i.excludeFromShopping,
  )) {
    const item = single.find(
      (i) =>
        i.name.toLowerCase() === ingredient.name.toLowerCase() &&
        i.unit === ingredient.unit,
    )!;
    expect(item.quantity).toBeCloseTo(
      (ingredient.quantity * 5) / r.servings,
      5,
    );
  }
});
it("can explicitly reset legacy inferred override flags without touching protected meals", () => {
  const s = generate();
  s.plan[0] = { ...s.plan[0], people: 2, appetite: 1, portionOverride: true };
  s.plan[1] = { ...s.plan[1], people: 2, appetite: 1, locked: true };
  s.plan[2] = { ...s.plan[2], people: 2, appetite: 1, cooked: true };
  const protectedMeals = s.plan.slice(1, 3);
  const result = generateWeeklyPlan(
    s,
    { ...preferencesFor(s), people: 4, appetite: 1.25 },
    { confirmReplace: true, resetPortions: true, random: () => 0 },
  ).state;
  expect(
    result.plan.find(
      (m) => m.day === s.plan[0].day && m.category === s.plan[0].category,
    ),
  ).toMatchObject({ people: 4, appetite: 1.25, portionOverride: false });
  for (const meal of protectedMeals)
    expect(
      result.plan.find(
        (m) => m.day === meal.day && m.category === meal.category,
      ),
    ).toEqual(meal);
});
