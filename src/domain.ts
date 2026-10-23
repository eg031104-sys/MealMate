import { supports } from "./appliances";
export type Category = "Breakfast" | "Lunch" | "Dinner" | "Snacks" | "Sides";
export const categories: Category[] = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
];
export type Ingredient = {
  name: string;
  quantity: number;
  unit: "g" | "ml" | "each";
  department: string;
  rawMeasure?: string;
  prepared?: boolean;
  approximate?: boolean;
  estimateKey?: string;
  estimateMultiplier?: number;
  excludeFromShopping?: boolean;
  measurementNote?: string;
};
export type Recipe = {
  id: string;
  name: string;
  category: Category;
  servings: number;
  wait?: number;
  prep: number;
  cook: number;
  appliances: string[];
  diet: string[];
  ingredients: Ingredient[];
  instructions: string[];
  emoji: string;
  colour: string;
  description?: string;
  image?: string;
  archived?: boolean;
  origin?: "household" | "external" | "mechanical" | "ai";
  photo?: {
    url: string;
    author: string;
    license: string;
    sourceUrl: string;
    cacheAllowed: boolean;
  };
  preparedIngredients?: string[];
  allergens?: string[];
  cuisine?: string;
  difficulty?: string;
  source?: { name: string; url: string; license: string; externalId?: string };
  review?: string[];
  favourite?: boolean;
  repeat?: import("./planning-model").RepeatPreference;
  methods?: {
    appliances: string[];
    instructions: string[];
    prep: number;
    cook: number;
  }[];
};
export type Meal = {
  day: number;
  category: Category;
  recipeId: string | null;
  people: number;
  appetite: number;
  locked: boolean;
  substitutions?: Record<string, Ingredient>;
  cooked?: boolean;
  portionOverride?: boolean;
};
export type Settings = {
  people: number;
  appetite: number;
  diet: string[];
  dislikes: string;
  appliances: string[];
  maxTime: number;
  measurementOverrides?: import("./measurements").MeasurementOverrides;
  categories: Category[];
};
export type ShoppingItem = Ingredient & { key: string };
export const defaults: Settings = {
  people: 2,
  appetite: 1,
  diet: [],
  dislikes: "",
  appliances: ["Hob", "Oven", "Blender", "Toaster"],
  maxTime: 60,
  categories: ["Breakfast", "Lunch", "Dinner"],
};
export function scaleQuantity(
  quantity: number,
  baseServings: number,
  people: number,
  appetite: number,
) {
  if (
    ![quantity, baseServings, people, appetite].every(Number.isFinite) ||
    quantity < 0 ||
    baseServings <= 0 ||
    people <= 0 ||
    appetite < 0.75 ||
    appetite > 2.5
  )
    throw new Error("Invalid serving values");
  return (quantity * people * appetite) / baseServings;
}
export function cookingMethod(r: Recipe, s: Settings) {
  if (r.appliances.every((a) => supports(a, s.appliances)))
    return {
      appliances: r.appliances,
      instructions: r.instructions,
      prep: r.prep,
      cook: r.cook,
    };
  return r.methods?.find((m) =>
    m.appliances.every((a) => supports(a, s.appliances)),
  );
}
export function usable(r: Recipe) {
  return (
    !r.review?.length &&
    Number.isFinite(r.servings) &&
    r.servings > 0 &&
    r.ingredients.some((i) => !i.excludeFromShopping && i.quantity > 0) &&
    r.ingredients.every(
      (i) =>
        Number.isFinite(i.quantity) &&
        (i.quantity > 0 ||
          (i.quantity === 0 && i.excludeFromShopping === true)) &&
        ["g", "ml", "each"].includes(i.unit),
    ) &&
    r.instructions.length > 0
  );
}
export function matches(r: Recipe, s: Settings) {
  const method = cookingMethod(r, s);
  return (
    usable(r) &&
    !!method &&
    s.diet.every((d) => r.diet.includes(d)) &&
    method.prep + method.cook + (r.wait ?? 0) <= s.maxTime &&
    !s.dislikes
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .some((d) => r.ingredients.some((i) => i.name.toLowerCase().includes(d)))
  );
}
export function generatePlan(
  plan: Meal[],
  recipes: Recipe[],
  s: Settings,
): Meal[] {
  const used = new Set<string>();
  return Array.from({ length: 7 }, (_, day) =>
    s.categories.map((category) => {
      const old = plan.find((m) => m.day === day && m.category === category);
      if (old?.locked) return old;
      const options = recipes.filter(
        (r) => r.category === category && matches(r, s),
      );
      const fresh = options.filter((r) => !used.has(r.id));
      const pool = fresh.length ? fresh : options;
      const selected = pool[Math.floor(Math.random() * pool.length)];
      if (selected) used.add(selected.id);
      return {
        day,
        category,
        recipeId: selected?.id ?? null,
        people: old?.people ?? s.people,
        appetite: old?.appetite ?? s.appetite,
        locked: false,
      };
    }),
  )
    .flat()
    .concat(plan.filter((m) => !s.categories.includes(m.category)));
}
export function shoppingList(
  plan: Meal[],
  recipes: Recipe[],
  enabled: Category[],
): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();
  for (const meal of plan) {
    if (!enabled.includes(meal.category)) continue;
    const r = recipes.find((r) => r.id === meal.recipeId);
    if (!r) continue;
    if (!usable(r)) continue;
    for (const original of r.ingredients) {
      const chosen = meal.substitutions?.[original.name] ?? original;
      const i = r.preparedIngredients?.includes(original.name)
        ? { ...chosen, prepared: true }
        : chosen;
      if (i.excludeFromShopping) continue;
      const key = `${i.name.trim().toLowerCase()}|${i.unit}${i.prepared ? "|prepared" : ""}`;
      const quantity = scaleQuantity(
        i.quantity,
        r.servings,
        meal.people,
        meal.appetite,
      );
      const old = items.get(key);
      items.set(key, {
        ...i,
        key,
        approximate: i.approximate || old?.approximate,
        quantity: quantity + (old?.quantity ?? 0),
      });
    }
  }
  return [...items.values()].sort(
    (a, b) =>
      a.department.localeCompare(b.department) || a.name.localeCompare(b.name),
  );
}
export function quantity(n: number, unit: string) {
  return `${Number(n.toFixed(1))} ${unit}`;
}
