import { expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  curatedRecipes,
  curationCounts,
  curationTargets,
} from "./curated-recipes";
import { genuineRecipes, upgradeCatalogue } from "./genuine-recipes";
import { defaults, usable, type Recipe } from "./domain";
import {
  curateSource,
  parseSourceIngredient,
  type SourceCandidate,
} from "./recipe-curation";
import { fromMealDB, importRecipes } from "./recipe-import";
import { emptyV2, exportBackup, parseBackup, type State } from "./v2-state";
import { emptyV3 } from "./v3-state";
import {
  requirements,
  smartGenerate,
  recordPurchase,
  inventory,
} from "./shopping";
const recipe = (id: string) =>
  curatedRecipes.find((r) => r.id === `pdr-${id}`)!;
const source: SourceCandidate = {
  slug: "fixture",
  name: "Fixture only",
  author: "Test",
  servings: 2,
  yieldLabel: "2",
  prep: 5,
  cook: 10,
  ingredients: ["2 handfuls spinach", "salt to taste"],
  instructions: ["Simmer spinach in a pan."],
  photo: null,
};
function state(): State {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "fixture",
      name: "Test fixture store",
      chain: "IGA",
      suburb: "Fixture",
      postcode: "4000",
      address: "",
      origin: "user",
    },
  ];
  v3.primary = "fixture";
  return {
    settings: {
      ...defaults,
      people: 4,
      appetite: 1.5,
      categories: ["Dinner"],
      appliances: [
        "Gas stovetop",
        "Conventional oven",
        "Fan-forced oven",
        "Slow cooker",
        "BBQ",
      ],
      maxTime: 90,
    },
    recipes: curatedRecipes,
    plan: [],
    week: "2026-10-19",
    checked: [],
    pantry: [],
    v2: emptyV2(),
    v3,
  };
}
it("reports the genuine batch and the remaining target honestly", () => {
  expect(curationCounts()).toEqual({
    Dinner: 35,
    Lunch: 16,
    Breakfast: 14,
    Snacks: 10,
  });
  expect(curatedRecipes).toHaveLength(75);
  expect(
    Object.values(curationTargets).reduce((a, b) => a + b, 0) -
      curatedRecipes.length,
  ).toBe(25);
  expect(new Set(curatedRecipes.map((r) => r.id)).size).toBe(75);
  expect(new Set(curatedRecipes.map((r) => r.name.toLowerCase())).size).toBe(
    75,
  );
  expect(curatedRecipes.every(usable)).toBe(true);
  expect(
    curatedRecipes.every(
      (r) =>
        r.origin === "external" &&
        r.source?.url.startsWith("https://") &&
        r.source.externalId &&
        r.source.license,
    ),
  ).toBe(true);
});
it("generates seven different genuine dinners for the selected store with household scaling", () => {
  const next = smartGenerate(state());
  const dinners = next.plan.filter((m) => m.category === "Dinner");
  expect(dinners).toHaveLength(7);
  expect(new Set(dinners.map((m) => m.recipeId)).size).toBe(7);
  expect(
    dinners.every(
      (m) =>
        m.people === 4 &&
        m.appetite === 1.5 &&
        recipeById(m.recipeId)?.category === "Dinner",
    ),
  ).toBe(true);
});
function recipeById(id: string | null) {
  return curatedRecipes.find((r) => r.id === id);
}
it("scales real recipe yields and merges compatible raw ingredients while keeping cooked chicken separate", () => {
  const s = state();
  s.plan = [
    "pesto-chicken-quinoa-bowls",
    "cheddar-crusted-chicken",
    "easy-chicken-and-rice-casserole",
  ].map((id, day) => ({
    day,
    category: "Dinner",
    recipeId: recipe(id).id,
    people: 4,
    appetite: 1.5,
    locked: false,
  }));
  const items = requirements(s);
  expect(items.find((i) => i.key === "chicken breast|g")?.quantity).toBeCloseTo(
    1760.388555,
    5,
  );
  expect(
    items.find((i) => i.key === "cooked chicken|g|prepared")?.quantity,
  ).toBe(420);
  s.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: recipe("schnitzel").id,
      people: 4,
      appetite: 1.5,
      locked: false,
    },
  ];
  expect(requirements(s).find((i) => i.name === "veal cutlets")?.quantity).toBe(
    900,
  );
});
it("uses ingredient-specific estimates and never invents weights for unknown handfuls or food quantities", () => {
  expect(parseSourceIngredient("2 handfuls spinach")).toMatchObject({
    name: "spinach",
    quantity: 60,
    unit: "g",
    approximate: true,
  });
  expect(parseSourceIngredient("1 handful parsley")).toMatchObject({
    quantity: 15,
    unit: "g",
  });
  expect(parseSourceIngredient("1 pinch salt")).toMatchObject({
    quantity: 0.3,
    unit: "g",
  });
  expect(parseSourceIngredient("1 splash olive oil")).toMatchObject({
    quantity: 5,
    unit: "ml",
  });
  expect(parseSourceIngredient("1 thumb ginger")).toMatchObject({
    quantity: 15,
    unit: "g",
    approximate: true,
  });
  expect(parseSourceIngredient("1 handful unknown vegetable")).toBeUndefined();
  expect(parseSourceIngredient("Chicken breast")).toBeUndefined();
  expect(parseSourceIngredient("salt to taste")).toMatchObject({
    quantity: 0,
    excludeFromShopping: true,
  });
  expect(usable(curateSource({ ...source, servings: 0 }, "Lunch"))).toBe(false);
});
it("preserves the lower authorised yield and the original range", () => {
  const c = curateSource(
    { ...source, slug: "ranged", servings: 4, yieldLabel: "4–6" },
    "Dinner",
  );
  expect(c.servings).toBe(4);
  expect(c.description).toContain("4–6");
  expect(c.description).toContain("lower stated yield");
  const s = state();
  s.recipes = [c];
  s.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: c.id,
      people: 4,
      appetite: 1.5,
      locked: false,
    },
  ];
  expect(requirements(s)[0].quantity).toBe(90);
});
it("does not double-count separated eggs or purchase excluded seasonings", () => {
  const s = state();
  s.recipes = [recipe("butter-cake")];
  s.plan = [
    {
      day: 0,
      category: "Snacks",
      recipeId: s.recipes[0].id,
      people: 8,
      appetite: 1,
      locked: false,
    },
  ];
  s.settings.categories = ["Snacks"];
  expect(requirements(s).find((i) => i.name === "egg")?.quantity).toBe(4);
  expect(
    recipe("omelet").ingredients.filter((i) => i.name === "egg"),
  ).toHaveLength(1);
  expect(
    recipe("omelet").ingredients.find((i) => i.name === "egg")?.quantity,
  ).toBe(4);
  expect(
    requirements({
      ...state(),
      recipes: [curateSource(source, "Dinner")],
      plan: [
        {
          day: 0,
          category: "Dinner",
          recipeId: "pdr-fixture",
          people: 4,
          appetite: 1.5,
          locked: false,
        },
      ],
    }).map((i) => i.name),
  ).toEqual(["spinach"]);
});
it("keeps incomplete MealDB yields under review while normalising normal cooking expressions", () => {
  const imported = fromMealDB({
    idMeal: "fixture",
    strMeal: "Fixture",
    strIngredient1: "Spinach",
    strMeasure1: "2 handfuls",
    strIngredient2: "Salt",
    strMeasure2: "to taste",
    strInstructions: "Cook.",
  });
  expect(imported.ingredients[0]).toMatchObject({
    quantity: 60,
    unit: "g",
    approximate: true,
    rawMeasure: "2 handfuls",
  });
  expect(imported.ingredients[1]).toMatchObject({
    quantity: 0,
    excludeFromShopping: true,
  });
  expect(imported.servings).toBe(0);
  expect(usable(imported)).toBe(false);
});
it("retains household recipes, favourites, archives, purchases, stores and meal references through catalogue updates and backup", () => {
  const s = state();
  const household: Recipe = {
    ...recipe("schnitzel"),
    id: "mine",
    name: "Household saved recipe",
    origin: "household",
    source: undefined,
  };
  const archived = {
    ...recipe("pasta-alla-norma"),
    archived: true,
    favourite: true,
  };
  s.recipes = [household, archived];
  s.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: household.id,
      people: 3,
      appetite: 2,
      locked: true,
    },
  ];
  const bought = recordPurchase(
    s,
    {
      name: "veal cutlets",
      unit: "g",
      quantity: 1350,
      key: "veal cutlets|g",
      department: "Meat & seafood",
    },
    1500,
    25,
  );
  const next = {
    ...bought,
    recipes: upgradeCatalogue(bought.recipes, {
      "spinach|cup": { quantity: 45, unit: "g" },
    }),
  };
  expect(next.plan).toEqual(bought.plan);
  expect(next.v2).toEqual(bought.v2);
  expect(next.v3).toEqual(bought.v3);
  expect(next.recipes.find((r) => r.id === "mine")).toEqual(household);
  expect(next.recipes.find((r) => r.id === archived.id)).toEqual(archived);
  expect(upgradeCatalogue(next.recipes)).toHaveLength(next.recipes.length);
  expect(parseBackup(exportBackup(next)).v2.purchases).toEqual(
    bought.v2.purchases,
  );
  expect(inventory(next, "veal cutlets|g").purchased).toBe(1500);
  expect(importRecipes(next.recipes, [recipe("pasta-alla-norma")]).added).toBe(
    0,
  );
  expect(upgradeCatalogue([]).filter(usable)).toHaveLength(
    genuineRecipes.filter(usable).length + 75,
  );
});
it("bundles permitted matching photographs and attribution without fake image substitutions", () => {
  const photos = curatedRecipes.filter((r) => r.photo);
  expect(photos).toHaveLength(27);
  for (const r of photos) {
    expect(r.photo?.sourceUrl.startsWith("https://")).toBe(true);
    if (r.photo!.cacheAllowed) {
      expect(existsSync("public" + r.photo!.url)).toBe(true);
      const image = readFileSync("public" + r.photo!.url);
      expect(image.subarray(0, 4).toString()).toBe("RIFF");
      expect(image.subarray(8, 12).toString()).toBe("WEBP");
      expect(
        existsSync("public/recipe-sources/" + r.source!.externalId + ".md"),
      ).toBe(true);
    } else expect(r.source?.name).toContain("TheMealDB");
  }
  expect(curatedRecipes.filter((r) => !r.photo).every((r) => !r.image)).toBe(
    true,
  );
});
