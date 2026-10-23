import { describe, it, expect } from "vitest";
import { defaults, scaleQuantity, usable } from "./domain";
import type { Recipe, ShoppingItem } from "./domain";
import { starterRecipes } from "./recipes";
import { expandedRecipes } from "./collection";
import { curatedRecipes } from "./curated-recipes";
import { genuineRecipes, upgradeCatalogue } from "./genuine-recipes";
import {
  emptyV2,
  itemKey,
  migrateState,
  parseBackup,
  exportBackup,
} from "./v2-state";
import type { State } from "./v2-state";
import { emptyV3 } from "./v3-state";
import type { StoreProduct } from "./v3-state";
import {
  selectedStore,
  priceStatus,
  availabilityLabel,
  findSavedStores,
  saveStoreProduct,
  chooseStoreProduct,
  unavailable,
} from "./supermarkets";
import {
  budget,
  recommendation,
  requirements,
  smartGenerate,
  recordPurchase,
  inventory,
  available,
  rankedRecipes,
  today,
} from "./shopping";
import { servingCounts, updateHousehold } from "./household";
import { discoverable } from "./catalogue";
import {
  librarySuggestions,
  prepareIndependently,
  canOfferAI,
} from "./suggestions";
import { parseNumberDraft } from "./numeric";
import { importRecipes, fromMealDB } from "./recipe-import";
function fixture(): State {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "a",
      chain: "Coles",
      name: "Test branch A",
      suburb: "Test suburb",
      postcode: "4000",
      address: "",
      origin: "user",
    },
    {
      id: "b",
      chain: "Woolworths",
      name: "Test branch B",
      suburb: "Test suburb",
      postcode: "4001",
      address: "",
      origin: "user",
    },
  ];
  v3.primary = "a";
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
    pantry: [],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  };
}
const chicken = (s: State) =>
  requirements(s).find((i) => i.name === "Chicken breast")!;
const product = (
  s: State,
  storeId = "a",
  size = 1000,
  price: number | undefined = 12,
): StoreProduct => ({
  id: storeId + "-chicken",
  storeId,
  ingredientKey: chicken(s).key,
  name: "Test chicken pack",
  unit: "g",
  size,
  price,
  source: "user",
  availability: "unknown",
});
describe("store-first configuration and catalogue", () => {
  it("round trips specific primary and weekly stores without deleting V2 data", () => {
    const s = fixture();
    s.v3!.weekStores[s.week] = "b";
    s.v3!.comparisonStores = ["a"];
    const next = parseBackup(exportBackup(s));
    expect(selectedStore(next)?.id).toBe("b");
    expect(next.plan).toEqual(s.plan);
    expect(next.v3).toEqual(s.v3);
  });
  it("finds saved branches by suburb and postcode", () => {
    const s = fixture();
    expect(findSavedStores(s.v3!.stores, "4001").map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(findSavedStores(s.v3!.stores, "test suburb")).toHaveLength(2);
  });
  it("does not leak a price or pack size from a different store", () => {
    let s = fixture();
    s = saveStoreProduct(s, product(s, "a"));
    expect(recommendation(s, chicken(s)).cost).toBe(12);
    s.v3!.weekStores[s.week] = "b";
    const fallback = recommendation(s, chicken(s)).product;
    expect(fallback?.source).toBe("estimate");
    expect(fallback?.priceLabel).toBe("Estimated price");
    expect(fallback?.productId).toBeUndefined();
    expect(fallback?.storeId).toBeUndefined();
    expect(fallback?.size).not.toBe(1000);
    expect(fallback?.price).not.toBe(12);
  });
  it("calculates whole packages at the selected branch", () => {
    let s = fixture();
    s.recipes = s.recipes.map((r) =>
      r.id === "recipe-17"
        ? {
            ...r,
            ingredients: r.ingredients.map((i) =>
              i.name === "Chicken breast" ? { ...i, quantity: 750 } : i,
            ),
          }
        : r,
    );
    s = saveStoreProduct(s, product(s, "a", 1000, 12));
    s = saveStoreProduct(s, product(s, "b", 500, 5));
    expect(recommendation(s, chicken(s)).buy).toBe(1000);
    expect(recommendation(s, chicken(s)).cost).toBe(12);
    s.v3!.weekStores[s.week] = "b";
    expect(recommendation(s, chicken(s)).buy).toBe(1000);
    expect(recommendation(s, chicken(s)).cost).toBe(10);
  });
  it("supports another-store assignment without changing meal recipes", () => {
    let s = fixture();
    s = saveStoreProduct(s, product(s, "b", 500, 5));
    s.v3!.itemStores[`${s.week}/${chicken(s).key}`] = "b";
    expect(recommendation(s, chicken(s)).cost).toBe(5);
    expect(s.plan[0].recipeId).toBe("recipe-17");
  });
  it("refuses manual assertions of authorised live prices", () => {
    const s = fixture();
    expect(() =>
      saveStoreProduct(s, {
        ...product(s),
        source: "authorised",
        provider: "unconfigured",
      }),
    ).toThrow("configured trusted provider");
  });
  it("keeps unknown prices partial and never presents stock as verified", () => {
    const s = fixture();
    // An ingredient with insufficient information must still make the basket partial.
    s.recipes = s.recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients.map((i) => ({
        ...i,
        name: "Unidentified specialty ingredient",
      })),
    }));
    expect(budget(s).partial).toBe(true);
    expect(budget(s).total).toBe(0);
    expect(availabilityLabel()).toBe("Availability unknown");
  });
  it("prefers a usable product over a currently user-reported unavailable product", () => {
    let s = fixture();
    s = saveStoreProduct(s, {
      ...product(s),
      availability: "unavailable",
      availabilityAt: new Date().toISOString(),
      availabilitySource: "user",
    });
    s = saveStoreProduct(s, {
      ...product(s),
      id: "another-product",
      price: 15,
    });
    expect(chooseStoreProduct(s, chicken(s))?.id).toBe("another-product");
  });
});
describe("price freshness and provenance", () => {
  const now = Date.now();
  const base: StoreProduct = {
    id: "p",
    storeId: "a",
    ingredientKey: "rice|g",
    name: "Rice",
    unit: "g",
    size: 1000,
    price: 4,
    source: "authorised",
    provider: "test-only",
    sourceUrl: "https://example.test/authorised-feed",
    observedAt: new Date(now - 3600000).toISOString(),
    verifiedUntil: new Date(now + 3600000).toISOString(),
    availability: "unknown",
  };
  it("does not label imported data as live without a connected provider", () =>
    expect(priceStatus(base, now)).toBe("Unverified imported price"));
  it("can distinguish confirmed, recent and stale evidence for a trusted provider", () => {
    const trusted = new Set(["test-only"]);
    expect(priceStatus(base, now, trusted)).toBe("Confirmed current price");
    expect(
      priceStatus({ ...base, verifiedUntil: undefined }, now, trusted),
    ).toBe("Recently retrieved price");
    expect(
      priceStatus(
        {
          ...base,
          observedAt: new Date(now - 10 * 86400000).toISOString(),
          verifiedUntil: undefined,
        },
        now,
        trusted,
      ),
    ).toBe("Stale retrieved price");
  });
  it("labels user, estimated, demo and unknown prices accurately", () => {
    expect(priceStatus({ ...base, source: "user" })).toBe("User-entered price");
    expect(priceStatus({ ...base, source: "estimate" })).toBe(
      "Estimated price",
    );
    expect(priceStatus({ ...base, source: "demo" })).toBe(
      "Demonstration price",
    );
    expect(priceStatus({ ...base, price: undefined })).toBe("Unknown price");
  });
  it("expires availability observations instead of asserting old stock", () => {
    const p = {
      ...base,
      source: "user" as const,
      availability: "unavailable" as const,
      availabilitySource: "user" as const,
      availabilityAt: new Date(now - 2 * 86400000).toISOString(),
    };
    expect(availabilityLabel(p)).toContain("unknown");
    expect(unavailable(p)).toBe(false);
  });
});
describe("budget-aware generation", () => {
  function planning() {
    const s = fixture();
    const template = starterRecipes[17];
    const cheap: Recipe = {
      ...template,
      id: "cheap",
      name: "Test rice dish",
      favourite: true,
      ingredients: [
        { name: "Rice", quantity: 100, unit: "g", department: "Pantry" },
      ],
    };
    const expensive: Recipe = {
      ...cheap,
      id: "expensive",
      name: "Test salmon dish",
      favourite: false,
      ingredients: [
        {
          name: "Salmon",
          quantity: 300,
          unit: "g",
          department: "Meat & seafood",
        },
      ],
    };
    s.recipes = [cheap, expensive];
    s.plan = [];
    s.v3!.products = [
      {
        id: "rice",
        storeId: "a",
        ingredientKey: "rice|g",
        name: "Rice",
        unit: "g",
        size: 1000,
        price: 4,
        source: "user",
        availability: "unknown",
      },
      {
        id: "fish",
        storeId: "a",
        ingredientKey: "salmon|g",
        name: "Salmon",
        unit: "g",
        size: 1000,
        price: 40,
        source: "user",
        availability: "unknown",
      },
    ];
    s.v2.budgets[s.week] = 4;
    return s;
  }
  it("requires a specific saved store", () => {
    const s = planning();
    s.v3!.primary = null;
    expect(() => smartGenerate(s)).toThrow("specific store");
  });
  it("reuses one package over seven meals and stays within the known budget", () => {
    const s = smartGenerate(planning());
    expect(s.plan).toHaveLength(7);
    expect(s.plan.every((m) => m.recipeId === "cheap")).toBe(true);
    expect(requirements(s)[0].quantity).toBe(700);
    expect(budget(s).total).toBe(4);
  });
  it("excludes currently unavailable ingredients without changing locked meals", () => {
    const s = planning();
    s.v3!.products[0] = {
      ...s.v3!.products[0],
      availability: "unavailable",
      availabilityAt: new Date().toISOString(),
      availabilitySource: "user",
    };
    expect(smartGenerate(s).plan.every((m) => m.recipeId === null)).toBe(true);
    s.plan = [
      {
        day: 0,
        category: "Dinner",
        recipeId: "cheap",
        people: 4,
        appetite: 1.5,
        locked: true,
      },
    ];
    expect(smartGenerate(s).plan.find((m) => m.day === 0)).toEqual(s.plan[0]);
  });
  it("cannot bypass a known budget overrun by adding an unknown price", () => {
    const s = planning();
    s.recipes = s.recipes
      .filter((r) => r.id === "expensive")
      .map((r) => ({
        ...r,
        ingredients: [
          ...r.ingredients,
          {
            name: "Unknown sauce",
            quantity: 10,
            unit: "ml",
            department: "Pantry",
          },
        ],
      }));
    expect(smartGenerate(s).plan.every((m) => m.recipeId === null)).toBe(true);
  });
});
describe("genuine catalogue and import reliability", () => {
  it("archives all mechanical variants without deleting references or favourites", () => {
    const existing = [...starterRecipes, ...expandedRecipes];
    existing[30] = { ...existing[30], favourite: true };
    const next = upgradeCatalogue(existing);
    expect(next.filter((r) => r.origin === "mechanical")).toHaveLength(198);
    expect(next.find((r) => r.id === existing[30].id)?.favourite).toBe(true);
    expect(next.find((r) => r.id === existing[30].id)?.archived).toBe(true);
    expect(next.filter(discoverable)).toHaveLength(
      genuineRecipes.length + curatedRecipes.length,
    );
    expect(upgradeCatalogue(next)).toHaveLength(next.length);
  });
  it("contains four curated planning-ready external recipes and six review records", () => {
    expect(genuineRecipes.filter(usable)).toHaveLength(4);
    expect(genuineRecipes.filter((r) => r.photo)).toHaveLength(9);
    expect(
      genuineRecipes.every(
        (r) =>
          r.source?.externalId && r.source.license.includes("Public domain"),
      ),
    ).toBe(true);
  });
  it("retains user-created and saved mechanical meal links during migration", () => {
    const s = fixture();
    s.recipes = [
      ...s.recipes,
      expandedRecipes[0],
      { ...starterRecipes[0], id: "household-custom" },
    ];
    s.plan[0].recipeId = expandedRecipes[0].id;
    const next = migrateState(s);
    expect(next.plan[0].recipeId).toBe(expandedRecipes[0].id);
    expect(next.recipes.some((r) => r.id === "household-custom")).toBe(true);
    expect(
      next.recipes.find((r) => r.id === expandedRecipes[0].id)?.archived,
    ).toBe(true);
  });
  it("does not turn incomplete authentic imports into usable shopping recipes", () => {
    const r = fromMealDB({
      idMeal: "real-id",
      strMeal: "A genuine source title",
      strIngredient1: "Flour",
      strMeasure1: "some",
      strInstructions: "Mix and cook.",
      strMealThumb: "https://example.test/dish.jpg",
    });
    expect(usable(r)).toBe(false);
    expect(r.ingredients[0].quantity).toBe(0);
    expect(importRecipes([r], [r]).duplicates).toBe(1);
  });
  it("excludes AI-origin recipes from normal discovery and planning", () => {
    const s = fixture();
    s.recipes = [{ ...starterRecipes[17], origin: "ai" }];
    expect(discoverable(s.recipes[0])).toBe(false);
    expect(rankedRecipes(s, s.plan[0])).toHaveLength(0);
  });
});
describe("household propagation", () => {
  it("applies people and appetite together using original serving yield", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 1000, 12);
    const next = updateHousehold(s, 4, 1.5, "all");
    expect(next.settings.people).toBe(4);
    expect(next.settings.appetite).toBe(1.5);
    expect(chicken(next).quantity).toBe(1050);
    expect(next.v2.purchases).toEqual(s.v2.purchases);
    expect(scaleQuantity(200, 2, 4, 1.5)).toBe(600);
  });
  it("preserves individual overrides in defaults-only mode, including coincidentally matching new values", () => {
    const s = fixture();
    s.plan.push({
      ...s.plan[0],
      day: 1,
      people: 4,
      appetite: 1.5,
      portionOverride: true,
    });
    expect(servingCounts(s)).toEqual({ all: 2, defaults: 1, custom: 1 });
    const next = updateHousehold(s, 4, 1.5, "defaults");
    expect(next.plan[1].portionOverride).toBe(true);
    expect(updateHousehold(next, 6, 2, "defaults").plan[1].people).toBe(4);
  });
  it("preserves recipes, locks, daily switches, other weeks and cooked meals", () => {
    const s = fixture();
    s.plan[0].locked = true;
    s.plan.push({ ...s.plan[0], day: 1, cooked: true });
    s.v2.daily[s.week] = ["Dinner"];
    s.v2.weeks["2026-10-12"] = { plan: structuredClone(s.plan), checked: [] };
    const next = updateHousehold(s, 4, 1.5, "all");
    expect(next.plan[0].locked).toBe(true);
    expect(next.plan[0].recipeId).toBe(s.plan[0].recipeId);
    expect(next.plan[1]).toEqual(s.plan[1]);
    expect(next.v2).toEqual(s.v2);
  });
  it("rejects invalid defaults", () => {
    expect(() => updateHousehold(fixture(), 0, 1, "all")).toThrow();
    expect(parseNumberDraft("")).toBeUndefined();
    expect(parseNumberDraft("-1")).toBeUndefined();
    expect(parseNumberDraft("1.5", 0.75, 2.5)).toBe(1.5);
  });
});
describe("leftovers, prepared food and AI gating", () => {
  it("respects reservations and only consumes surplus when preparing independently", () => {
    let s = fixture();
    const apple: ShoppingItem = {
      name: "Apple",
      quantity: 2,
      unit: "each",
      department: "Fruit & veg",
      key: "apple|each",
    };
    const pb: ShoppingItem = {
      name: "Peanut butter",
      quantity: 40,
      unit: "g",
      department: "Pantry",
      key: "peanut butter|g",
    };
    s = recordPurchase(s, apple, 4);
    s = recordPurchase(s, pb, 80);
    const suggestion = librarySuggestions(s).find(
      (x) => x.recipe.id === "recipe-25",
    )!;
    expect(
      suggestion.usedQuantities.find((i) => i.name === "Apple")?.quantity,
    ).toBe(2);
    const next = prepareIndependently(s, suggestion);
    expect(next.plan).toEqual(s.plan);
    expect(next.v2.purchases.find((p) => p.name === "Apple")?.consumed).toBe(2);
    expect(next.v3?.independentMeals).toHaveLength(1);
  });
  it("keeps raw and prepared stock separate and requires safe date metadata", () => {
    let s = fixture();
    const i = chicken(s);
    s = recordPurchase(s, i, 500, 5, undefined, true);
    expect(available(s, i.key)).toBe(0);
    expect(available(s, i.key + "|prepared")).toBe(0);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    s.v2.purchases[0].expiry = tomorrow;
    s.v3!.storageDates[s.v2.purchases[0].id] = today();
    s.v3!.safeStorage[s.v2.purchases[0].id] = true;
    expect(available(s, i.key + "|prepared")).toBe(500);
    expect(available(s, i.key)).toBe(0);
  });
  it("matches explicitly prepared recipes and consumes prepared surplus only", () => {
    let s = fixture();
    const r: Recipe = {
      ...starterRecipes[24],
      id: "prepared-test",
      name: "Test prepared apple dish",
      preparedIngredients: ["Apple"],
    };
    s.recipes = [...s.recipes, r];
    s = recordPurchase(
      s,
      {
        name: "Apple",
        unit: "each",
        quantity: 2,
        department: "Fruit & veg",
        key: "apple|each",
      },
      4,
      1,
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      true,
    );
    s.v3!.storageDates[s.v2.purchases[0].id] = today();
    s.v3!.safeStorage[s.v2.purchases[0].id] = true;
    s = recordPurchase(
      s,
      {
        name: "Peanut butter",
        unit: "g",
        quantity: 40,
        department: "Pantry",
        key: "peanut butter|g",
      },
      80,
    );
    const suggestion = librarySuggestions(s).find((x) => x.recipe.id === r.id)!;
    expect(suggestion).toBeTruthy();
    const next = prepareIndependently(s, suggestion);
    expect(next.v2.purchases[0].consumed).toBe(2);
  });
  it("never offers an AI fallback when genuine matches exist or no provider is configured", () => {
    expect(canOfferAI([], null)).toBe(false);
    const provider = {
      id: "test-only",
      configured: true,
      async generate() {
        return starterRecipes[24];
      },
    };
    expect(canOfferAI([], provider)).toBe(true);
    expect(canOfferAI([{} as never], provider)).toBe(false);
  });
});
describe("preserving saved meals when the genuine catalogue is limited", () => {
  it("keeps an existing archived meal reference if no eligible replacement is available", () => {
    const s = fixture();
    s.recipes = s.recipes.map((r) => ({
      ...r,
      archived: true,
      origin: "ai" as const,
    }));
    const next = smartGenerate(s);
    expect(
      next.plan.find((m) => m.day === 0 && m.category === "Dinner")?.recipeId,
    ).toBe("recipe-17");
  });
  it("requires refrigeration confirmation before counting prepared food", () => {
    let s = fixture();
    s = recordPurchase(
      s,
      chicken(s),
      500,
      5,
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      true,
    );
    s.v3!.storageDates[s.v2.purchases[0].id] = today();
    expect(available(s, "chicken breast|g|prepared")).toBe(0);
  });
});
describe("high-risk leftover date handling", () => {
  it("does not offer raw meat surplus without a use-by date", () => {
    let s = fixture();
    s.plan = [];
    s.recipes = starterRecipes;
    s = recordPurchase(
      s,
      {
        name: "Chicken breast",
        quantity: 250,
        unit: "g",
        department: "Meat & seafood",
        key: "chicken breast|g",
      },
      500,
    );
    expect(
      librarySuggestions(s).some((s) => s.uses.includes("Chicken breast")),
    ).toBe(false);
    s.v2.purchases[0].expiry = new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10);
    expect(
      librarySuggestions(s).some((s) => s.uses.includes("Chicken breast")),
    ).toBe(true);
  });
});
describe("imported store data safeguards", () => {
  it("does not prefer an unverified imported quote over a known manual price", () => {
    let s = fixture();
    s = saveStoreProduct(s, product(s));
    s.v3!.products.push({
      ...product(s),
      id: "untrusted",
      price: 0.01,
      source: "authorised",
      provider: "not-connected",
    });
    expect(chooseStoreProduct(s, chicken(s))?.id).toBe("a-chicken");
  });
  it("rejects backups with missing stores or incompatible product units", () => {
    const s = fixture();
    s.v3!.primary = "missing";
    expect(() => parseBackup(exportBackup(s))).toThrow();
    s.v3!.primary = "a";
    s.v3!.products.push({ ...product(s), ingredientKey: "chicken breast|ml" });
    expect(() => parseBackup(exportBackup(s))).toThrow();
  });
});
