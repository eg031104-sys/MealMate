import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { openDB } from "idb";
import { defaults } from "./domain";
import { emptyV2 } from "./v2-state";
import { emptyV3 } from "./v3-state";
import { parseStores, saveFoundStore } from "./store-finder";
import { selectedStore } from "./supermarkets";
it("adds finder defaults to existing V3 data and persists searches, weeks and purchases without reset", async () => {
  const db = await openDB("mealmate", 3, {
    upgrade(db) {
      db.createObjectStore("household");
    },
  });
  const v3 = emptyV3();
  delete (v3 as unknown as Record<string, unknown>).storeFinder;
  const v2 = emptyV2();
  v2.purchases.push({
    id: "existing",
    week: "2026-10-19",
    key: "rice|g",
    name: "Rice",
    department: "Pantry",
    quantity: 1000,
    unit: "g",
    consumed: 100,
    price: 3,
    at: "2026-10-19T10:00:00Z",
    prepared: false,
  });
  v2.stock["flour|g"] = {
    name: "Flour",
    quantity: 500,
    unit: "g",
    consumed: 0,
    department: "Pantry",
    prepared: false,
  };
  const raw = {
    settings: defaults,
    recipes: [],
    plan: [],
    checked: ["rice|g"],
    pantry: ["Flour"],
    week: "2026-10-19",
    v2,
    v3,
  };
  await db.put("household", raw, "state");
  const { loadState, saveState } = await import("./storage");
  const state = (await loadState())!;
  expect(state.v3!.storeFinder.query).toBe("");
  expect(state.v2).toEqual(v2);
  const location = {
    id: "fixture",
    label: "Test suburb",
    postcode: "4272",
    latitude: -27.93,
    longitude: 153.19,
  };
  const store = parseStores(
    {
      elements: [
        {
          type: "node",
          id: 1,
          lat: -27.94,
          lon: 153.19,
          tags: { name: "IGA fixture", shop: "supermarket" },
        },
      ],
    },
    location,
    30,
  )[0];
  const next = saveFoundStore(state, store);
  next.v3!.storeFinder = {
    query: "4272",
    resultsQuery: "4272",
    location,
    results: [store],
    fetchedAt: new Date().toISOString(),
    radiusKm: 30,
  };
  await saveState(next);
  const reopened = (await loadState())!;
  expect(reopened.v3).toEqual(next.v3);
  expect(selectedStore(reopened)?.id).toBe(store.id);
  expect(reopened.v2).toEqual(v2);
  expect(reopened.checked).toEqual(raw.checked);
  expect(reopened.pantry).toEqual(raw.pantry);
  expect(reopened.settings).toEqual(raw.settings);
  expect(db.version).toBe(3);
  db.close();
});
