import { openDB } from "idb";
import { migrateState } from "./v2-state";
import type { State } from "./v2-state";
export type { State } from "./v2-state";
// Keep the original store and record. Store a recovery copy before the first
// migration, in the same atomic transaction as the migrated snapshot.
const database = openDB("mealmate", 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("household"))
      db.createObjectStore("household");
  },
  blocked() {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("mealmate-db-blocked"));
  },
  blocking() {
    database.then((db) => db.close());
  },
});
export async function loadState(): Promise<State | undefined> {
  const db = await database;
  const raw = await db.get("household", "state");
  if (!raw) return;
  const migrated = migrateState(raw);
  if (!raw.v2) {
    const tx = db.transaction("household", "readwrite");
    await tx.store.put(raw, "pre-v2-backup");
    await tx.store.put(migrated, "state");
    await tx.done;
  }
  return migrated;
}
export async function saveState(state: State) {
  const valid = migrateState(state);
  await (await database).put("household", valid, "state");
}
export async function restoreState(state: State) {
  const valid = migrateState(state);
  const db = await database;
  const tx = db.transaction("household", "readwrite");
  const old = await tx.store.get("state");
  if (old) await tx.store.put(old, "pre-restore-backup");
  await tx.store.put(valid, "state");
  await tx.done;
}

export async function readRawState() {
  return (await database).get("household", "state");
}
