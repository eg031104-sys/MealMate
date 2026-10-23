import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { openDB } from "idb";
import { defaults } from "./domain";
import { starterRecipes } from "./recipes";
describe("IndexedDB migration and persistence", () => {
  it("retains a recovery copy, migrates in place and persists all fields", async () => {
    const db = await openDB("mealmate", 1, {
      upgrade(db) {
        db.createObjectStore("household");
      },
    });
    const legacy = {
      settings: defaults,
      recipes: starterRecipes,
      plan: [],
      checked: ["old-check"],
      pantry: ["Rice"],
      week: "2026-10-19",
    };
    await db.put("household", legacy, "state");
    db.close();
    const { loadState, saveState, restoreState } = await import("./storage");
    const migrated = await loadState();
    expect(migrated?.checked).toEqual(["old-check"]);
    const read = await openDB("mealmate", 3);
    expect(await read.get("household", "pre-v2-backup")).toEqual(legacy);
    migrated!.v2.budgets["2026-10-19"] = 200;
    await saveState(migrated!);
    expect((await loadState())?.v2.budgets["2026-10-19"]).toBe(200);
    const restored = { ...migrated!, checked: ["restored"] };
    await restoreState(restored);
    expect((await loadState())?.checked).toEqual(["restored"]);
    expect((await read.get("household", "pre-restore-backup")).checked).toEqual(
      ["old-check"],
    );
    read.close();
  });
});
