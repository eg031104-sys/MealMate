import { z } from "zod";
import {
  planningSchema,
  repeatSchema,
  planningSettings,
} from "./planning-model";
import type { PlanningData } from "./planning-model";
import { archiveVariations } from "./catalogue";
import { emptyV3, v3Schema } from "./v3-state";
import type { V3 } from "./v3-state";
import type {
  Category,
  Ingredient,
  Meal,
  Recipe,
  Settings,
  ShoppingItem,
} from "./domain";
const nonnegative = z.number().finite().nonnegative();
export const categorySchema = z.enum([
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "Sides",
]);
const unit = z.enum(["g", "ml", "each"]);
export const ingredientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    quantity: nonnegative,
    unit,
    department: z.string().min(1).max(100),
    rawMeasure: z.string().optional(),
    prepared: z.boolean().optional(),
    approximate: z.boolean().optional(),
    estimateKey: z.string().optional(),
    estimateMultiplier: nonnegative.optional(),
    excludeFromShopping: z.boolean().optional(),
    measurementNote: z.string().optional(),
  })
  .passthrough();
const method = z.object({
  appliances: z.array(z.string()),
  instructions: z.array(z.string()),
  prep: nonnegative,
  cook: nonnegative,
});
export const recipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: categorySchema,
    servings: nonnegative,
    wait: nonnegative.optional(),
    prep: nonnegative,
    cook: nonnegative,
    appliances: z.array(z.string()),
    diet: z.array(z.string()),
    ingredients: z.array(ingredientSchema),
    instructions: z.array(z.string()),
    emoji: z.string(),
    colour: z.string(),
    description: z.string().optional(),
    image: z.string().optional(),
    archived: z.boolean().optional(),
    origin: z.enum(["household", "external", "mechanical", "ai"]).optional(),
    photo: z
      .object({
        url: z.string(),
        author: z.string(),
        license: z.string(),
        sourceUrl: z.string(),
        cacheAllowed: z.boolean(),
      })
      .optional(),
    preparedIngredients: z.array(z.string()).optional(),
    allergens: z.array(z.string()).optional(),
    cuisine: z.string().optional(),
    difficulty: z.string().optional(),
    source: z
      .object({
        name: z.string(),
        url: z.string(),
        license: z.string(),
        externalId: z.string().optional(),
      })
      .optional(),
    review: z.array(z.string()).optional(),
    favourite: z.boolean().optional(),
    repeat: repeatSchema.optional(),
    methods: z.array(method).optional(),
  })
  .passthrough();
const mealSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    category: categorySchema,
    recipeId: z.string().nullable(),
    people: z.number().int().min(1).max(12),
    appetite: z.number().min(0.75).max(2.5),
    locked: z.boolean(),
    substitutions: z.record(z.string(), ingredientSchema).optional(),
    cooked: z.boolean().optional(),
    portionOverride: z.boolean().optional(),
  })
  .passthrough();
const settingsSchema = z
  .object({
    people: z.number().int().min(1).max(12),
    appetite: z.number().min(0.75).max(2.5),
    diet: z.array(z.string()),
    dislikes: z.string(),
    appliances: z.array(z.string()),
    maxTime: nonnegative,
    measurementOverrides: z
      .record(
        z.string(),
        z.object({ quantity: z.number().finite().positive(), unit }),
      )
      .optional(),
    categories: z.array(categorySchema),
  })
  .passthrough();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) &&
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s,
  );
const productSchema = z.object({
  size: z.number().finite().positive(),
  price: nonnegative.optional(),
  source: z.enum(["demo", "user", "estimate"]),
  shop: z.string().optional(),
  name: z.string().optional(),
  storeId: z.string().optional(),
  productId: z.string().optional(),
  priceLabel: z.string().optional(),
  availabilityLabel: z.string().optional(),
  unavailable: z.boolean().optional(),
  observedAt: z.string().optional(),
  special: z.boolean().optional(),
});
export type Product = z.infer<typeof productSchema>;
const purchaseSchema = z
  .object({
    id: z.string().min(1),
    week: date,
    key: z.string(),
    name: z.string(),
    department: z.string(),
    unit,
    quantity: z.number().finite().positive(),
    consumed: nonnegative,
    price: nonnegative.optional(),
    at: z.string(),
    expiry: date.optional(),
    prepared: z.boolean(),
    storeId: z.string().optional(),
    productId: z.string().optional(),
  })
  .refine(
    (p) => p.consumed <= p.quantity,
    "Consumed quantity exceeds purchase",
  );
export type Purchase = z.infer<typeof purchaseSchema>;
const stockSchema = z
  .object({
    name: z.string(),
    unit,
    department: z.string(),
    quantity: nonnegative.nullable(),
    consumed: nonnegative,
    expiry: date.optional(),
    prepared: z.boolean(),
  })
  .refine(
    (p) => p.quantity === null || p.consumed <= p.quantity,
    "Consumed quantity exceeds stock",
  );
export type Stock = z.infer<typeof stockSchema>;
export const v2Schema = z.object({
  version: z.literal(2),
  daily: z.record(z.string(), z.array(categorySchema)),
  budgets: z.record(z.string(), nonnegative.nullable()),
  products: z.record(z.string(), productSchema),
  staples: z.record(z.string(), z.boolean()),
  stock: z.record(z.string(), stockSchema),
  purchases: z.array(purchaseSchema),
  decisions: z.record(
    z.string(),
    z.object({ action: z.enum(["enough", "shop"]), quantity: nonnegative }),
  ),
  otherShops: z.record(z.string(), z.string()),
  baseline: z.record(
    z.string(),
    z.array(ingredientSchema.extend({ key: z.string() })),
  ),
  recent: z.array(z.string()),
  weeks: z.record(
    z.string(),
    z.object({ plan: z.array(mealSchema), checked: z.array(z.string()) }),
  ),
  allergies: z.array(z.string()),
});
export type V2 = z.infer<typeof v2Schema>;
export type State = {
  settings: Settings;
  recipes: Recipe[];
  plan: Meal[];
  checked: string[];
  pantry: string[];
  week: string;
  v2: V2;
  v3?: V3;
  planning?: PlanningData;
};
export const legacySchema = z
  .object({
    settings: settingsSchema,
    recipes: z.array(recipeSchema).max(10000),
    plan: z.array(mealSchema),
    checked: z.array(z.string()),
    pantry: z.array(z.string()),
    week: date,
  })
  .passthrough();
export function emptyV2(): V2 {
  return {
    version: 2,
    daily: {},
    budgets: {},
    products: {},
    staples: {},
    stock: {},
    purchases: [],
    decisions: {},
    otherShops: {},
    baseline: {},
    recent: [],
    weeks: {},
    allergies: [],
  };
}
export function migrateState(raw: unknown): State {
  const base = legacySchema.parse(raw);
  const existing = (raw as { v2?: unknown }).v2;
  const v2 = existing ? v2Schema.parse(existing) : emptyV2();
  // V1 included supermarket department in ingredient keys. Identity in V2 is
  // name + unit, so an imported recipe can change aisle without losing a tick.
  if (!existing)
    base.checked = base.checked.map((key) => {
      const parts = key.split("|");
      return parts.length === 3 && ["g", "ml", "each"].includes(parts[1])
        ? parts.slice(0, 2).join("|")
        : key;
    });
  base.recipes = archiveVariations(base.recipes as Recipe[]);
  const v3 = (raw as { v3?: unknown }).v3;
  const planning = (raw as { planning?: unknown }).planning;
  return {
    ...base,
    v2,
    v3: v3 ? v3Schema.parse(v3) : emptyV3(),
    ...(planning ? { planning: planningSchema.parse(planning) } : {}),
  } as State;
}
export function parseBackup(text: string): State {
  if (text.length > 25_000_000) throw Error("Backup exceeds 25 MB");
  const file = JSON.parse(text);
  if (file.format !== "mealmate-backup" || ![1, 2, 3].includes(file.version))
    throw Error("This is not a supported MealMate backup");
  const state = migrateState(file.state);
  const ids = new Set(state.recipes.map((r) => r.id));
  if (ids.size !== state.recipes.length) throw Error("Duplicate recipe IDs");
  for (const m of [
    ...state.plan,
    ...Object.values(state.v2.weeks).flatMap((w) => w.plan),
  ])
    if (m.recipeId && !ids.has(m.recipeId))
      throw Error("A planned recipe is missing from the backup");
  if (
    new Set(state.v2.purchases.map((p) => p.id)).size !==
    state.v2.purchases.length
  )
    throw Error("Duplicate purchase IDs");
  for (const h of state.planning?.history ?? [])
    if (!ids.has(h.recipeId))
      throw Error("A cooking history recipe is missing from the backup");
  const keys = new Set<string>();
  for (const m of state.plan) {
    const key = `${m.day}/${m.category}`;
    if (keys.has(key)) throw Error("Duplicate meal slots");
    keys.add(key);
  }
  return state;
}
export function exportBackup(state: State) {
  return JSON.stringify(
    {
      format: "mealmate-backup",
      version: 3,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}
export function dateForDay(week: string, day: number) {
  const d = new Date(week + "T12:00:00");
  d.setDate(d.getDate() + day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function enabledCategories(state: State, day: number): Category[] {
  return (
    state.v2.daily[dateForDay(state.week, day)] ??
    planningSettings(state).categories
  );
}
export function activeMeals(state: State) {
  return state.plan.filter(
    (m) => enabledCategories(state, m.day).includes(m.category) && !m.cooked,
  );
}
export function setDayCategories(
  state: State,
  day: number,
  enabled: Category[] | null,
): State {
  const daily = { ...state.v2.daily };
  const key = dateForDay(state.week, day);
  if (enabled === null) delete daily[key];
  else daily[key] = enabled;
  const plan = [...state.plan];
  for (const category of enabled ?? planningSettings(state).categories)
    if (!plan.some((m) => m.day === day && m.category === category))
      plan.push({
        day,
        category,
        recipeId: null,
        people: planningSettings(state).people,
        appetite: planningSettings(state).appetite,
        locked: false,
      });
  return { ...state, plan, v2: { ...state.v2, daily } };
}
export function switchWeek(state: State, week: string): State {
  const weeks = {
    ...state.v2.weeks,
    [state.week]: { plan: state.plan, checked: state.checked },
  };
  return {
    ...state,
    week,
    plan: weeks[week]?.plan ?? [],
    checked: weeks[week]?.checked ?? [],
    v2: { ...state.v2, weeks },
  };
}
export const itemKey = (i: Ingredient) =>
  `${i.name.trim().toLowerCase()}|${i.unit}${i.prepared ? "|prepared" : ""}`;
export const decisionKey = (state: State, key: string) =>
  `${state.week}/${key}`;
export function mealLabel(m: Meal, week?: string) {
  return `${week ? new Date(dateForDay(week, m.day) + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long" }) : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][m.day]} ${m.category.toLowerCase()}`;
}
export type Requirement = ShoppingItem;
