import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { openDB } from "idb";
import { defaults } from "./domain";
import { starterRecipes } from "./recipes";
import { emptyV2 } from "./v2-state";
it("safely migrates an existing V2 household and preserves purchase and pantry records", async () => {
  const db = await openDB("mealmate", 2, {
    upgrade(db) {
      db.createObjectStore("household");
    },
  });
  const raw = {
    settings: defaults,
    recipes: starterRecipes,
    plan: [
      {
        day: 0,
        category: "Dinner",
        recipeId: "recipe-17",
        people: 4,
        appetite: 1.5,
        locked: true,
      },
    ],
    checked: ["chicken breast|g"],
    pantry: ["Rice"],
    week: "2026-10-19",
    v2: emptyV2(),
  };
  raw.v2.stock["rice|g"] = {
    name: "Rice",
    quantity: 500,
    unit: "g",
    department: "Pantry",
    consumed: 50,
    prepared: false,
  };
  await db.put("household", raw, "state");
  db.close();
  const { loadState, saveState } = await import("./storage");
  const migrated = (await loadState())!;
  expect(migrated.plan).toEqual(raw.plan);
  expect(migrated.v2).toEqual(raw.v2);
  expect(migrated.v3?.version).toBe(3);
  const read = await openDB("mealmate", 3);
  expect(await read.get("household", "pre-v3-backup")).toEqual(raw);
  migrated.v3!.stores.push({
    id: "store",
    chain: "IGA",
    name: "Test IGA branch",
    suburb: "Test",
    postcode: "4000",
    address: "",
    origin: "user",
  });
  migrated.v3!.primary = "store";
  await saveState(migrated);
  expect((await loadState())?.v3?.primary).toBe("store");
  read.close();
});
