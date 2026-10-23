import { z } from "zod";
import type { State } from "./v2-state";
import type { Settings, Meal } from "./domain";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) &&
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s,
  );
export const repeatSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("normal") }),
  z.object({ mode: z.literal("weekly-random") }),
  z.object({
    mode: z.literal("weekly-fixed"),
    day: z.number().int().min(0).max(6),
  }),
]);
export type RepeatPreference = z.infer<typeof repeatSchema>;
export const preferencesSchema = z.object({
  people: z.number().int().min(1).max(12),
  appetite: z.number().min(0.75).max(2.5),
  diet: z.array(z.string()),
  appliances: z.array(z.string()),
  maxTime: z.number().finite().nonnegative(),
  categories: z
    .array(z.enum(["Breakfast", "Lunch", "Dinner", "Snacks"]))
    .min(1)
    .refine((a) => new Set(a).size === a.length),
  storeId: z.string().min(1).nullable(),
  budget: z.number().finite().nonnegative().nullable(),
  allergies: z.array(z.string()).default([]),
});
export type PlanningPreferences = z.infer<typeof preferencesSchema>;
export const historySchema = z.object({
  id: z.string().min(1),
  recipeId: z.string().min(1),
  date,
  week: date,
  day: z.number().int().min(0).max(6),
  category: z.enum(["Breakfast", "Lunch", "Dinner", "Snacks", "Sides"]),
  people: z.number().int().min(1).max(12),
  appetite: z.number().min(0.75).max(2.5),
  stockDeltas: z
    .record(z.string(), z.number().finite().nonnegative())
    .optional(),
  purchaseDeltas: z
    .record(z.string(), z.number().finite().nonnegative())
    .optional(),
});
export type CookedEntry = z.infer<typeof historySchema>;
export const planningSchema = z
  .object({
    last: preferencesSchema.optional(),
    weeks: z.record(date, preferencesSchema).default({}),
    history: z.array(historySchema).default([]),
    reports: z.record(date, z.array(z.string())).default({}),
  })
  .refine(
    (p) => new Set(p.history.map((h) => h.id)).size === p.history.length,
    "Duplicate cooking history entries",
  );
export type PlanningData = z.infer<typeof planningSchema>;
export const planningData = (s: State): PlanningData =>
  s.planning ?? { weeks: {}, history: [], reports: {} };
export function planningSettings(s: State): Settings {
  const p = s.planning?.weeks[s.week];
  return p
    ? {
        ...s.settings,
        people: p.people,
        appetite: p.appetite,
        diet: p.diet,
        appliances: p.appliances,
        maxTime: p.maxTime,
        categories: p.categories,
      }
    : s.settings;
}
export function planningAllergies(s: State) {
  return [
    ...new Set([
      ...s.v2.allergies,
      ...(s.planning?.weeks[s.week]?.allergies ?? []),
    ]),
  ]
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

// Reuse saved portions only with evidence of a deliberate override. Merely
// differing from today's defaults can mean a stale, automatically planned meal.
// Loading saved data never calls this: portions change only on explicit planning actions.
export function generationPortions(s: State, meal?: Meal) {
  const settings = planningSettings(s);
  const preserve =
    meal &&
    (meal.portionOverride === true ||
      meal.locked ||
      meal.cooked ||
      (!s.planning?.weeks[s.week] && meal.portionOverride === undefined));
  return {
    people: preserve ? meal.people : settings.people,
    appetite: preserve ? meal.appetite : settings.appetite,
    portionOverride: meal?.portionOverride === true,
  };
}
