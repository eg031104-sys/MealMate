import { describe, it, expect } from "vitest";
import { defaults, matches, shoppingList, scaleQuantity } from "./domain";
import type { Meal, Recipe, ShoppingItem } from "./domain";
import { starterRecipes } from "./recipes";
import { expandedRecipes, addCollection } from "./collection";
import {
  emptyV2,
  migrateState,
  parseBackup,
  exportBackup,
  enabledCategories,
  setDayCategories,
  switchWeek,
  itemKey,
} from "./v2-state";
import type { State } from "./storage";
import {
  acknowledgeChanges,
  requirements,
  recordPurchase,
  inventory,
  recommendation,
  budget,
  changes,
  replaceMeal,
  substitute,
  sendToOtherShop,
  smartGenerate,
  isStaple,
  stapleSuggested,
  consumeMeal,
  available,
  convertQuantity,
} from "./shopping";
import { fromMealDB, importRecipes, metricMeasure } from "./recipe-import";
import { librarySuggestions } from "./suggestions";
function fixture(): State {
  return {
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: starterRecipes,
    plan: [
      {
        day: 0,
        category: "Dinner",
        recipeId: "recipe-17",
        people: 2,
        appetite: 1,
        locked: false,
      },
    ],
    checked: [],
    pantry: ["Olive oil"],
    week: "2026-10-19",
    v2: emptyV2(),
  };
}
const find = (s: State, name: string) =>
  requirements(s).find((i) => i.name === name)!;
const chicken = (s: State) => find(s, "Chicken breast");
describe("daily categories", () => {
  it("inherits defaults but changes only Wednesday", () => {
    const s = fixture();
    const next = setDayCategories(s, 2, ["Dinner", "Lunch"]);
    expect(enabledCategories(next, 2)).toEqual(["Dinner", "Lunch"]);
    expect(enabledCategories(next, 1)).toEqual(["Dinner"]);
    expect(enabledCategories(next, 3)).toEqual(["Dinner"]);
  });
  it("disabling does not delete meals or portions; reset restores defaults", () => {
    let s = fixture();
    s.plan[0].people = 4;
    s.plan[0].appetite = 1.5;
    const original = structuredClone(s.plan[0]);
    s = setDayCategories(s, 0, []);
    expect(requirements(s)).toEqual([]);
    expect(s.plan[0]).toEqual(original);
    s = setDayCategories(s, 0, null);
    expect(chicken(s).quantity).toBe(1050);
  });
  it("daily overrides survive weekly default changes and refresh migration", () => {
    let s = setDayCategories(fixture(), 2, ["Dinner", "Lunch"]);
    s.settings.categories = ["Breakfast"];
    s = migrateState(JSON.parse(JSON.stringify(s)));
    expect(enabledCategories(s, 2)).toEqual(["Dinner", "Lunch"]);
    expect(enabledCategories(s, 1)).toEqual(["Breakfast"]);
  });
  it("generation honours disabled slots without deleting them", () => {
    let s = setDayCategories(fixture(), 0, []);
    s = smartGenerate(s);
    expect(s.plan.find((m) => m.day === 0)?.recipeId).toBe("recipe-17");
    expect(
      requirements({ ...s, plan: s.plan.filter((m) => m.day === 0) }),
    ).toEqual([]);
  });
  it("retains different saved plans and daily settings by week", () => {
    const original = setDayCategories(fixture(), 2, ["Dinner", "Lunch"]);
    let s = switchWeek(original, "2026-10-26");
    expect(s.plan).toEqual([]);
    s = switchWeek(s, "2026-10-19");
    expect(s.plan).toEqual(original.plan);
    expect(enabledCategories(s, 2)).toContain("Lunch");
  });
});
describe("appliance compatibility", () => {
  it("supports equivalent stovetops, not unsupported methods", () => {
    const r = starterRecipes[0];
    expect(
      matches(r, { ...defaults, appliances: ["Induction stovetop"] }),
    ).toBe(true);
    expect(matches(r, { ...defaults, appliances: ["Air fryer"] })).toBe(false);
    expect(
      matches(starterRecipes[16], {
        ...defaults,
        appliances: ["Fan-forced oven"],
      }),
    ).toBe(false);
  });
  it("uses a supplied alternative method with its own time", () => {
    const r: Recipe = {
      ...starterRecipes[16],
      methods: [
        {
          appliances: ["Fan-forced oven"],
          instructions: ["Cook at 180°C for 30 minutes."],
          prep: 10,
          cook: 30,
        },
      ],
    };
    expect(matches(r, { ...defaults, appliances: ["Fan-forced oven"] })).toBe(
      true,
    );
    expect(
      matches(r, { ...defaults, appliances: ["Fan-forced oven"], maxTime: 20 }),
    ).toBe(false);
  });
});
describe("aggregate pantry & staples", () => {
  it("aggregates across meals before pantry checks", () => {
    const s = fixture();
    s.plan = [0, 1, 2].map((day) => ({ ...s.plan[0], day }));
    expect(find(s, "Olive oil").quantity).toBe(60);
  });
  it("respects explicit staple overrides despite purchase history", () => {
    let s = fixture();
    const item = find(s, "Olive oil");
    s = recordPurchase(recordPurchase(s, item, 500), item, 500);
    expect(stapleSuggested(s, item.name)).toBe(true);
    s.v2.staples["olive oil"] = false;
    expect(isStaple(s, item.name)).toBe(false);
  });
  it("unknown opening stock is never counted as inventory", () => {
    const s = fixture();
    const i = chicken(s);
    s.v2.stock[i.key] = { ...i, quantity: null, consumed: 0, prepared: false };
    expect(available(s, i.key)).toBe(0);
    expect(inventory(s, i.key).shortage).toBe(350);
  });
});
describe("purchase ledger and reservations", () => {
  it("reserves 750g of a 1kg purchase and retains 250g", () => {
    let s = fixture();
    s.plan[0].people = 3;
    s.plan[0].appetite = 10 / 7;
    const i = chicken(s);
    expect(i.quantity).toBeCloseTo(750);
    s = recordPurchase(s, i, 1000, 12);
    const stock = inventory(s, i.key);
    expect(stock.purchased).toBe(1000);
    expect(stock.reserved).toBeCloseTo(750);
    expect(stock.available).toBeCloseTo(250);
    expect(stock.consumed).toBe(0);
  });
  it("shows shortages when buying less without changing meals", () => {
    const s = fixture();
    const next = recordPurchase(s, chicken(s), 200, 3);
    expect(inventory(next, chicken(s).key).shortage).toBe(150);
    expect(next.plan).toEqual(s.plan);
  });
  it("preserves purchases and releases reservations after removing a meal", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 1000, 12);
    s.plan = [];
    expect(inventory(s, i.key).available).toBe(1000);
    expect(budget(s).total).toBe(12);
  });
  it("recalculates reservations when servings change after shopping", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 500, 6);
    s.plan[0].people = 4;
    expect(inventory(s, i.key).shortage).toBe(200);
    expect(s.v2.purchases[0].quantity).toBe(500);
  });
  it("only consumes on explicit cooking and prevents double consumption", () => {
    let s = fixture();
    for (const i of requirements(s))
      s = recordPurchase(s, i, i.quantity + 100, 1);
    const m = s.plan[0];
    s = consumeMeal(s, m);
    expect(requirements(s)).toEqual([]);
    expect(
      s.v2.purchases.find((p) => p.name === "Chicken breast")?.consumed,
    ).toBe(350);
    expect(() => consumeMeal(s, s.plan[0])).toThrow("already");
  });
  it("rejects cooking with insufficient stock atomically", () => {
    const s = fixture();
    expect(() => consumeMeal(s, s.plan[0])).toThrow("Not enough");
    expect(s.plan[0].cooked).toBeUndefined();
  });
  it("never converts weight to volume", () => {
    expect(convertQuantity(1, "kg", "g")).toBe(1000);
    expect(convertQuantity(2, "l", "ml")).toBe(2000);
    expect(convertQuantity(1, "g", "ml")).toBeUndefined();
  });
});
describe("budget estimates", () => {
  it("charges whole packages, not consumed fractions", () => {
    const s = fixture();
    const i = chicken(s);
    s.plan[0].people = 3;
    s.plan[0].appetite = 10 / 7;
    expect(recommendation(s, chicken(s)).buy).toBe(1000);
    expect(recommendation(s, chicken(s)).cost).toBe(12);
  });
  it("keeps budgets separately per week", () => {
    const s = fixture();
    s.v2.budgets[s.week] = 200;
    const next = switchWeek(s, "2026-10-26");
    expect(budget(next).limit).toBeUndefined();
    expect(budget(s).limit).toBe(200);
  });
  it("uses actual total purchase prices and does not charge purchased stock twice", () => {
    let s = fixture();
    for (const i of requirements(s)) s = recordPurchase(s, i, i.quantity, 1);
    expect(budget(s).total).toBe(requirements(s).length);
  });
  it("labels missing prices as partial instead of inventing costs", () => {
    const s = fixture();
    const i = chicken(s);
    s.v2.products[i.key] = { size: 1000, source: "user" };
    expect(budget(s).partial).toBe(true);
    expect(budget(s).missing).toBe(1);
  });
  it("flags unresolved pantry checks as partial", () => {
    const s = fixture();
    expect(budget(s).uncertain).toBe(1);
    expect(budget(s).partial).toBe(true);
  });
  it("respects an explicitly free user price", () => {
    const s = fixture();
    s.v2.products[chicken(s).key] = { size: 1000, price: 0, source: "user" };
    expect(recommendation(s, chicken(s)).cost).toBe(0);
  });
});
describe("unavailable items and shopping changes", () => {
  it("requires approval before replacing a locked meal, retaining portions", () => {
    const s = fixture();
    s.plan[0].locked = true;
    const replacement = starterRecipes[17];
    expect(() => replaceMeal(s, s.plan[0], replacement)).toThrow("locked");
    const next = replaceMeal(s, s.plan[0], replacement, true);
    expect(next.plan[0].people).toBe(s.plan[0].people);
    expect(next.plan[0].locked).toBe(true);
    expect(next.plan[0].recipeId).toBe(replacement.id);
  });
  it("only changes the affected meal", () => {
    const s = fixture();
    s.plan.push({ ...s.plan[0], day: 1 });
    const next = replaceMeal(s, s.plan[0], starterRecipes[17]);
    expect(next.plan[1]).toEqual(s.plan[1]);
  });
  it("retains required ingredients shared by other meals", () => {
    let s = fixture();
    s.plan.push({ ...s.plan[0], day: 1 });
    s = acknowledgeChanges(s);
    s = replaceMeal(s, s.plan[0], starterRecipes[17]);
    const c = changes(s).find((i) => i.name === "Chicken breast");
    expect(c?.change).toBe("reduced");
    expect(c?.quantity).toBe(350);
  });
  it("highlights new, increased and removed quantities until acknowledged", () => {
    let s = acknowledgeChanges(fixture());
    s.plan[0].people = 4;
    expect(changes(s).find((i) => i.name === "Chicken breast")?.change).toBe(
      "increased",
    );
    s = replaceMeal(s, s.plan[0], starterRecipes[17]);
    expect(changes(s).some((i) => i.change === "new")).toBe(true);
    expect(changes(s).find((i) => i.name === "Chicken breast")?.change).toBe(
      "removed",
    );
    s = acknowledgeChanges(s);
    expect(changes(s).every((i) => i.change === "same")).toBe(true);
  });
  it("preserves purchases and ticks through substitution and meal swaps", () => {
    let s = fixture();
    const lemon = find(s, "Lemon");
    s = recordPurchase(s, lemon, 2, 2);
    s = substitute(s, lemon, "Lime");
    expect(requirements(s).some((i) => i.name === "Lime")).toBe(true);
    expect(s.v2.purchases).toHaveLength(1);
    expect(s.checked).toContain(lemon.key);
  });
  it("rejects unverified substitutions and allergy conflicts", () => {
    const s = fixture();
    expect(() => substitute(s, chicken(s), "Beef mince")).toThrow("verified");
    const lemon = find(s, "Lemon");
    s.v2.allergies = ["lime"];
    expect(() => substitute(s, lemon, "Lime")).toThrow("verified");
  });
  it("moving to another shop does not purchase or remove the requirement", () => {
    const s = fixture();
    const i = chicken(s);
    const next = sendToOtherShop(s, i.key, "Another supermarket");
    expect(requirements(next)).toEqual(requirements(s));
    expect(next.checked).toEqual([]);
    expect(next.v2.purchases).toEqual([]);
  });
});
describe("recipes & suggestions", () => {
  it("adds 198 usable original variations without replacing existing recipes", () => {
    expect(expandedRecipes).toHaveLength(198);
    const all = addCollection(starterRecipes);
    expect(all).toHaveLength(228);
    expect(addCollection(all)).toHaveLength(228);
    expect(
      expandedRecipes.every(
        (r) => r.ingredients.every((i) => i.quantity > 0) && r.servings === 2,
      ),
    ).toBe(true);
  });
  it("does not invent serving sizes or ambiguous source quantities", () => {
    const r = fromMealDB({
      idMeal: "1",
      strMeal: "Soup",
      strIngredient1: "Salt",
      strMeasure1: "to taste",
      strInstructions: "Cook soup.",
    });
    expect(r.servings).toBe(0);
    expect(r.ingredients[0].quantity).toBe(0);
    expect(r.review?.length).toBeGreaterThan(0);
    expect(matches(r, defaults)).toBe(false);
  });
  it("converts explicit measures only and deduplicates imports", () => {
    expect(metricMeasure("1 kg")).toEqual({ quantity: 1000, unit: "g" });
    expect(metricMeasure("2 cups")).toBeUndefined();
    expect(metricMeasure("1/2")).toEqual({ quantity: 0.5, unit: "each" });
    const r = starterRecipes[0];
    expect(importRecipes([r], [{ ...r, id: "other-id" }]).duplicates).toBe(1);
  });
  it("does not suggest meals from expired or merely unknown stock", () => {
    const s = fixture();
    s.plan = [];
    const i = starterRecipes[24].ingredients[0];
    s.v2.stock[itemKey(i)] = {
      ...i,
      quantity: null,
      consumed: 0,
      prepared: false,
    };
    expect(librarySuggestions(s)).toEqual([]);
    s.v2.stock[itemKey(i)] = {
      ...i,
      quantity: 10,
      consumed: 0,
      prepared: false,
      expiry: "2000-01-01",
    };
    expect(librarySuggestions(s)).toEqual([]);
  });
  it("uses surplus after reservations for local snack suggestions", () => {
    let s = fixture();
    const i: ShoppingItem = {
      name: "Apple",
      quantity: 2,
      unit: "each",
      department: "Fruit & veg",
      key: "apple|each",
    };
    s = recordPurchase(s, i, 4);
    const options = librarySuggestions(s, 2);
    expect(options.some((o) => o.recipe.id === "recipe-25")).toBe(true);
    expect(options.some((o) => o.recipe.id === "recipe-17")).toBe(false);
  });
});
describe("migration and backup validation", () => {
  it("preserves legacy state, unknown user recipes, portions, locks and shopping ticks", () => {
    const s = fixture();
    const { v2, ...old } = s;
    old.plan[0].locked = true;
    old.checked = ["legacy-key"];
    old.recipes = [...old.recipes, { ...old.recipes[0], id: "user-recipe" }];
    const next = migrateState(old);
    expect(next.plan).toEqual(old.plan);
    expect(next.recipes).toMatchObject(JSON.parse(JSON.stringify(old.recipes)));
    expect(next.checked).toEqual(old.checked);
    expect(next.pantry).toEqual(old.pantry);
    expect(next.settings.appliances).toEqual(old.settings.appliances);
    expect(next.v2.version).toBe(2);
  });
  it("round trips every v2 record", () => {
    let s = recordPurchase(fixture(), chicken(fixture()), 1000, 12);
    s = setDayCategories(s, 2, ["Lunch", "Dinner"]);
    s.v2.budgets[s.week] = 200;
    s = acknowledgeChanges(s);
    expect(parseBackup(exportBackup(s))).toMatchObject(
      JSON.parse(JSON.stringify(s)),
    );
  });
  it("rejects malformed backups and broken meal references", () => {
    expect(() => parseBackup("{}")).toThrow();
    const s = fixture();
    s.plan[0].recipeId = "missing";
    expect(() => parseBackup(exportBackup(s))).toThrow("missing");
  });
  it("rejects negative inventory and duplicate purchase IDs", () => {
    const s = fixture();
    s.v2.stock["x"] = {
      name: "Rice",
      unit: "g",
      department: "Pantry",
      quantity: -1,
      consumed: 0,
      prepared: false,
    };
    expect(() => parseBackup(exportBackup(s))).toThrow();
  });
});
describe("stock verification safeguards", () => {
  it("does not count prepared ingredients as raw inventory", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 1000, 12, undefined, true);
    expect(available(s, i.key)).toBe(0);
    expect(inventory(s, i.key).shortage).toBe(350);
  });
  it("requires old purchases without dates to be reconfirmed", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 1000, 12);
    s.v2.purchases[0].at = "2020-01-01T12:00:00Z";
    expect(available(s, i.key)).toBe(0);
    expect(s.v2.purchases).toHaveLength(1);
  });
  it("rejects duplicate purchase IDs in a backup", () => {
    let s = fixture();
    s = recordPurchase(s, chicken(s), 1000);
    s.v2.purchases.push({ ...s.v2.purchases[0] });
    expect(() => parseBackup(exportBackup(s))).toThrow(
      "Duplicate purchase IDs",
    );
  });
  it("prevents exclusions from being bypassed during a meal replacement", () => {
    const s = fixture();
    s.v2.allergies = ["pasta"];
    expect(() => replaceMeal(s, s.plan[0], starterRecipes[17])).toThrow(
      "preferences",
    );
  });
});
describe("ingredient identity", () => {
  it("merges the same ingredient and unit even when source departments differ", () => {
    const s = fixture();
    const r = {
      ...starterRecipes[0],
      id: "duplicate-department",
      ingredients: [
        {
          name: "Rice",
          quantity: 100,
          unit: "g" as const,
          department: "Pantry & grains",
        },
        {
          name: "Rice",
          quantity: 50,
          unit: "g" as const,
          department: "Imported — review",
        },
      ],
    };
    const result = shoppingList(
      [
        {
          day: 0,
          category: "Breakfast",
          recipeId: r.id,
          people: 2,
          appetite: 1,
          locked: false,
        },
      ],
      [r],
      ["Breakfast"],
    );
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(150);
  });
  it("migrates existing department-based shopping ticks to stable ingredient keys", () => {
    const { v2, ...s } = fixture();
    s.checked = ["chicken breast|g|Meat & seafood"];
    expect(migrateState(s).checked).toEqual(["chicken breast|g"]);
  });
});
