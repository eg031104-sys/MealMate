import { it, expect, vi, afterEach } from "vitest";
import { migrateState, exportBackup, parseBackup } from "./v2-state";
import { estimateIngredient } from "./product-estimates";
import {
  parseCommunityProducts,
  parsePack,
  productImageUrl,
  communityProducts,
} from "./product-source";
import {
  chooseStoreProduct,
  saveStoreProduct,
  selectProduct,
  shoppingPreferences,
  priceStatus,
  availabilityLabel,
} from "./supermarkets";
import { rankProducts } from "./product-ranking";
import {
  recommendation,
  budget,
  requirements,
  inventory,
  recordPurchase,
  productFor,
} from "./shopping";
import {
  shoppingFixture,
  ingredient,
  testProduct,
} from "./shopping-test-fixture";
// Synthetic responses exercise schema handling; they are not shipped catalogue records.
const apiRecord = {
  code: "0000000000001",
  product_name: "Fixture Tomato Paste",
  brands: "Synthetic test brand",
  quantity: "200 g",
  countries_tags: ["en:australia"],
  stores_tags: ["coles"],
  image_front_small_url:
    "https://images.openfoodfacts.org/images/products/000/000/000/0001/front_en.1.100.jpg",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("parses weight, volume, individual items and multipacks without density guesses", () => {
  expect(parsePack("6 x 200 g")).toEqual({ size: 1200, unit: "g" });
  expect(parsePack("1.5 kg")).toEqual({ size: 1500, unit: "g" });
  expect(parsePack("2 × 1 L")).toEqual({ size: 2000, unit: "ml" });
  expect(parsePack("12 eggs")).toEqual({ size: 12, unit: "each" });
  expect(parsePack("a large tub")).toBeUndefined();
  expect(parsePack("0 g")).toBeUndefined();
});
it("matches only sourced AU records associated with the selected chain and compatible packs", () => {
  const s = shoppingFixture();
  const result = parseCommunityProducts(
    {
      products: [
        apiRecord,
        apiRecord,
        { ...apiRecord, quantity: "200 ml" },
        { ...apiRecord, stores_tags: ["woolworths"] },
        { ...apiRecord, countries_tags: ["en:france"] },
        { ...apiRecord, code: undefined },
        { ...apiRecord, quantity: "one tub" },
        { ...apiRecord, product_name: "Tomato sauce" },
      ],
    },
    s.v3!.stores[0],
    ingredient,
  );
  expect(result).toHaveLength(1);
  expect(result[0].name).toBe(apiRecord.product_name);
  expect(result[0].brand).toBe(apiRecord.brands);
  expect(result[0].barcode).toBe(apiRecord.code);
  expect(result[0].sourceUrl).toBe(
    `https://world.openfoodfacts.org/product/${apiRecord.code}`,
  );
  expect(result[0].price).toBeUndefined();
  expect(result[0].source).toBe("community");
  expect(result[0].availability).toBe("unknown");
  expect(result[0].image).toBe(apiRecord.image_front_small_url);
});
it.each(["Coles", "Woolworths", "ALDI", "IGA"] as const)(
  "supports community retailer filtering for %s without asserting stock",
  (chain) => {
    const store = { ...shoppingFixture().v3!.stores[0], chain };
    const [p] = parseCommunityProducts(
      { products: [{ ...apiRecord, stores_tags: [chain.toLowerCase()] }] },
      store,
      ingredient,
    );
    expect(p).toBeTruthy();
    expect(availabilityLabel(p)).toBe("Availability unknown");
    expect(priceStatus({ ...p, price: 2 })).toBe("Unknown price");
  },
);
it("never generates a branded record or photo when source data is missing or malformed", () => {
  const store = shoppingFixture().v3!.stores[0];
  expect(parseCommunityProducts({}, store, ingredient)).toEqual([]);
  expect(
    parseCommunityProducts(
      { products: [{}, { product_name: "Made up" }] },
      store,
      ingredient,
    ),
  ).toEqual([]);
  expect(
    productImageUrl("https://unrelated.example/product.jpg"),
  ).toBeUndefined();
  expect(productImageUrl("javascript:alert(1)")).toBeUndefined();
  const item = {
    ...ingredient,
    name: "Milk",
    unit: "ml" as const,
    key: "milk|ml",
  };
  expect(
    parseCommunityProducts(
      {
        products: [
          { ...apiRecord, quantity: "200 ml", product_name: "Milk chocolate" },
        ],
      },
      store,
      item,
    ),
  ).toEqual([]);
});
it("uses approximate non-branded ingredient estimates, but leaves genuinely unknown items unknown", () => {
  const p = estimateIngredient(ingredient)!;
  expect(p.priceLabel).toBe("Estimated price");
  expect(p.price % 0.5).toBe(0);
  expect(p).not.toHaveProperty("name");
  expect(p).not.toHaveProperty("image");
  expect(
    estimateIngredient({ ...ingredient, name: "Unidentified speciality" }),
  ).toBeUndefined();
  expect(estimateIngredient({ ...ingredient, prepared: true })).toBeUndefined();
  expect(estimateIngredient({ ...ingredient, unit: "ml" })).toBeUndefined();
});
it("keeps real product identity while separately estimating a missing product price", () => {
  const s = saveStoreProduct(shoppingFixture(), testProduct());
  const p = productFor(s, ingredient)!;
  expect(p.name).toBe("Synthetic fixture tomato paste");
  expect(p.productId).toBe("test-product");
  expect(p.priceLabel).toBe("Estimated price");
  expect(p.price).toBeGreaterThan(0);
  expect(p.availabilityLabel).toBe("Availability unknown");
});
it("charges one jar for 70 g and two packs for 750 g; deducts quantified pantry only once", () => {
  let s = saveStoreProduct(shoppingFixture(), testProduct("jar", 200, 3));
  expect(recommendation(s, ingredient)).toMatchObject({
    packs: 1,
    buy: 200,
    cost: 3,
  });
  s = saveStoreProduct(s, testProduct("jar", 500, 5));
  const need = { ...ingredient, quantity: 750 };
  expect(recommendation(s, need)).toMatchObject({
    packs: 2,
    buy: 1000,
    cost: 10,
  });
  s.v2.stock[ingredient.key] = {
    ...ingredient,
    quantity: 200,
    consumed: 0,
    prepared: false,
  };
  expect(recommendation(s, { ...ingredient, quantity: 300 })).toMatchObject({
    shortage: 100,
    packs: 1,
    buy: 500,
    cost: 5,
  });
  expect(inventory(s, ingredient.key, 300).onHand).toBe(200);
});
it("does not turn recommended surplus into inventory, and preserves actual purchases when changing selections", () => {
  let s = saveStoreProduct(shoppingFixture(), testProduct("jar", 200, 3));
  expect(inventory(s, ingredient.key).onHand).toBe(0);
  s = recordPurchase(s, ingredient, 200, 4);
  const receipts = structuredClone(s.v2.purchases);
  expect(inventory(s, ingredient.key, 70).available).toBe(130);
  s = selectProduct(s, ingredient.key, null);
  expect(s.v2.purchases).toEqual(receipts);
  expect(budget(s).total).toBe(4);
  expect(recommendation(s, ingredient).shortage).toBe(0);
});
it("respects explicit alternative selection and generic opt-out while recalculating budget", () => {
  let s = saveStoreProduct(shoppingFixture(), testProduct("small", 100, 2));
  s = saveStoreProduct(s, testProduct("big", 500, 5));
  expect(budget(s).total).toBe(2);
  s = selectProduct(s, ingredient.key, "big");
  expect(recommendation(s, ingredient).buy).toBe(500);
  expect(budget(s).total).toBe(5);
  s = selectProduct(s, ingredient.key, null);
  expect(productFor(s, ingredient)?.productId).toBeUndefined();
  expect(productFor(s, ingredient)?.priceLabel).toBe("Estimated price");
  expect(() => selectProduct(s, ingredient.key, "not-a-real-id")).toThrow();
});
it("user price overrides win and apply to a stable product package, not consumed quantities", () => {
  let s = selectProduct(
    saveStoreProduct(shoppingFixture(), testProduct("jar", 200, 3)),
    ingredient.key,
    "jar",
  );
  s.v3!.shopping!.priceOverrides["test-store/tomato paste|g/jar"] = 4.5;
  expect(productFor(s, ingredient)?.priceLabel).toBe("User price");
  expect(recommendation(s, { ...ingredient, quantity: 450 }).cost).toBe(13.5);
  s.v2.budgets[s.week] = 10;
  expect(budget(s).remaining).toBe(5.5);
  s.plan[0].people = 8;
  expect(budget(s).total).toBe(9);
  expect(s.v2.purchases).toEqual([]);
});
it("unknown product prices make basket totals incomplete when no reasonable ingredient estimate exists", () => {
  const s = shoppingFixture();
  s.recipes[0].ingredients = [
    { ...ingredient, name: "Unidentified speciality" },
  ];
  expect(budget(s)).toMatchObject({ partial: true, missing: 1, total: 0 });
});
it("unknown pantry quantities stay uncertain and are never silently deducted", () => {
  const s = shoppingFixture();
  s.v2.stock[ingredient.key] = {
    ...ingredient,
    quantity: null,
    consumed: 0,
    prepared: false,
  };
  expect(inventory(s, ingredient.key, 70).shortage).toBe(70);
  expect(budget(s)).toMatchObject({ partial: true, uncertain: 1 });
});
it("Balanced avoids waste instead of picking the median-priced package; Budget remains economical", () => {
  const products = [
    testProduct("cheap-unit-huge-pack", 1000, 5),
    testProduct("suitable-small", 200, 3),
    testProduct("middle-price", 500, 4),
  ];
  expect(rankProducts(products, ingredient, 70, "Balanced")[0].id).toBe(
    "suitable-small",
  );
  expect(rankProducts(products, ingredient, 70, "Budget")[0].id).toBe(
    "suitable-small",
  );
  expect(rankProducts(products, ingredient, 70, "Premium")[0].id).toBe(
    "suitable-small",
  );
});
it("Premium rewards suitability, not a high price, and few products do not manufacture tiers", () => {
  const products = [
    { ...testProduct("less-suitable", 200, 2), suitability: 0.6 },
    testProduct("suitable", 200, 3),
    testProduct("expensive", 200, 10),
  ];
  expect(rankProducts(products, ingredient, 70, "Premium")[0].id).toBe(
    "suitable",
  );
  const pair = products.slice(1);
  expect(rankProducts(pair, ingredient, 70, "Budget")[0].id).toBe(
    rankProducts(pair, ingredient, 70, "Premium")[0].id,
  );
});
it("skips reported unavailable products, but never fabricates live availability", () => {
  let s = saveStoreProduct(shoppingFixture(), {
    ...testProduct("bad", 200, 1),
    availability: "unavailable",
    availabilitySource: "user",
    availabilityAt: new Date().toISOString(),
  });
  s = saveStoreProduct(s, testProduct("ok", 200, 4));
  expect(chooseStoreProduct(s, ingredient)?.id).toBe("ok");
  expect(productFor(s, ingredient)?.availabilityLabel).toBe(
    "Availability unknown",
  );
});
it("keeps household, stores, pantry, recipes and plans when old V3 data has no new shopping fields", () => {
  const s = shoppingFixture(),
    original = structuredClone(s);
  const next = migrateState(s);
  expect(shoppingPreferences(next).preference).toBe("Balanced");
  expect(next.settings).toEqual(original.settings);
  expect(next.v3!.stores).toEqual(original.v3!.stores);
  expect(next.plan).toEqual(original.plan);
  expect(next.recipes).toEqual(original.recipes);
  expect(next.pantry).toEqual(original.pantry);
  const chosen = selectProduct(
    saveStoreProduct(next, testProduct()),
    ingredient.key,
    "test-product",
  );
  chosen.v3!.shopping!.preference = "Premium";
  chosen.v3!.shopping!.priceOverrides[
    "test-store/tomato paste|g/test-product"
  ] = 5;
  const restored = parseBackup(exportBackup(chosen));
  expect(restored.v3!.shopping).toEqual(chosen.v3!.shopping);
});
it("scales shared ingredients and package costs when people or appetite change", () => {
  const s = shoppingFixture();
  s.plan[0].people = 4;
  s.plan[0].appetite = 1.5;
  s.plan.push({ ...s.plan[0], day: 1 });
  expect(requirements(s)[0].quantity).toBe(420);
  expect(recommendation(s, requirements(s)[0]).packs).toBe(3);
});
it("public lookup caches responses, throttles requests and does not retry a failing endpoint", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01"));
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products: [apiRecord] }),
  });
  vi.stubGlobal("fetch", fetcher);
  const s = shoppingFixture(),
    store = s.v3!.stores[0];
  await communityProducts.search(store, ingredient);
  await communityProducts.search(store, ingredient);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain("/cgi/search.pl?");
  expect(fetcher.mock.calls[0][0]).toContain("tag_1=coles");
  await expect(
    communityProducts.search(store, { ...ingredient, key: "other|g" }),
  ).rejects.toThrow("7 seconds");
  vi.advanceTimersByTime(7000);
  fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(
    communityProducts.search(store, { ...ingredient, key: "other|g" }),
  ).rejects.toThrow("Generic estimates remain available");
  await expect(
    communityProducts.search(store, { ...ingredient, key: "another|g" }),
  ).rejects.toThrow("cooling down");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("Balanced can choose a lower-waste mainstream pack instead of the cheapest cash outlay", () => {
  const products = [
    testProduct("huge", 1000, 2),
    testProduct("sensible", 200, 3),
    testProduct("middle-price", 500, 4),
  ];
  expect(rankProducts(products, ingredient, 70, "Balanced")[0].id).toBe(
    "sensible",
  );
  expect(rankProducts(products, ingredient, 70, "Budget")[0].id).toBe("huge");
});
it("a genuine supplied record outranks an example product without claiming its price is verified", () => {
  const real = {
    ...testProduct("real", 200),
    source: "community" as const,
    provider: "open-food-facts",
  };
  const demo = { ...testProduct("demo", 200, 1), source: "demo" as const };
  expect(rankProducts([demo, real], ingredient, 70, "Balanced")[0].id).toBe(
    "real",
  );
  expect(priceStatus(real)).toBe("Unknown price");
});
it("does not confuse ingredients with finished foods or substrings", () => {
  const store = shoppingFixture().v3!.stores[0];
  for (const [name, title] of [
    ["Rice", "Rice crackers"],
    ["Rice", "Licorice"],
    ["Pasta", "Pasta sauce"],
    ["Chicken", "Chicken curry"],
  ]) {
    expect(
      parseCommunityProducts(
        { products: [{ ...apiRecord, product_name: title }] },
        store,
        { ...ingredient, name },
      ),
    ).toEqual([]);
  }
});
it("includes outstanding packages in the budget after a quantified pantry deduction and updates on stock edits", () => {
  const s = saveStoreProduct(shoppingFixture(), testProduct("jar", 200, 3));
  s.plan[0].people = 10; // 350 g needed
  s.v2.stock[ingredient.key] = {
    ...ingredient,
    quantity: 200,
    consumed: 0,
    prepared: false,
  };
  expect(budget(s)).toMatchObject({ total: 3, partial: false, uncertain: 0 });
  s.v2.stock[ingredient.key].quantity = 0;
  expect(budget(s).total).toBe(6);
  s.v2.stock[ingredient.key].quantity = 350;
  expect(budget(s).total).toBe(0);
});
