import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { openDB } from "idb";
import {
  shoppingFixture,
  ingredient,
  testProduct,
} from "./shopping-test-fixture";
import {
  saveStoreProduct,
  selectProduct,
  shoppingPreferences,
} from "./supermarkets";
import { recordPurchase } from "./shopping";
it("reads pre-upgrade V3 unchanged and persists product preferences without losing household records", async () => {
  const db = await openDB("mealmate", 3, {
    upgrade(db) {
      db.createObjectStore("household");
    },
  });
  const legacy = shoppingFixture();
  legacy.v3!.storeFinder.query = "4272";
  legacy.pantry = ["Rice"];
  legacy.checked = [ingredient.key];
  const purchased = recordPurchase(legacy, ingredient, 200, 4);
  await db.put("household", purchased, "state");
  const { loadState, saveState } = await import("./storage");
  const loaded = (await loadState())!;
  expect(shoppingPreferences(loaded).preference).toBe("Balanced");
  expect(await db.get("household", "state")).toEqual(purchased);
  const updated = selectProduct(
    saveStoreProduct(loaded, testProduct()),
    ingredient.key,
    "test-product",
  );
  updated.v3!.shopping!.preference = "Premium";
  updated.v3!.shopping!.priceOverrides[
    "test-store/tomato paste|g/test-product"
  ] = 5;
  await saveState(updated);
  const refreshed = (await loadState())!;
  expect(refreshed.v3!.shopping).toEqual(updated.v3!.shopping);
  expect(refreshed.v3!.storeFinder.query).toBe("4272");
  expect(refreshed.v3!.stores).toEqual(purchased.v3!.stores);
  expect(refreshed.settings).toEqual(purchased.settings);
  expect(refreshed.v2.purchases).toEqual(purchased.v2.purchases);
  expect(refreshed.recipes).toEqual(purchased.recipes);
  expect(refreshed.plan).toEqual(purchased.plan);
  expect(refreshed.pantry).toEqual(["Rice"]);
  expect(refreshed.checked).toEqual(purchased.checked);
  db.close();
});
