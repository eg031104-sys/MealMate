import { estimateIngredient } from "./product-estimates";
import {
  planningSettings,
  planningAllergies,
  generationPortions,
} from "./planning-model";
import { discoverable } from "./catalogue";
import {
  selectedStore,
  assignedStore,
  chooseStoreProduct,
  priceStatus,
  availabilityLabel,
  unavailable,
  genuineSpecial,
  storeRequired,
  shoppingPreferences,
  productSelectionKey,
} from "./supermarkets";
import { shoppingList, scaleQuantity, matches, usable } from "./domain";
import type { Ingredient, Meal, Recipe, ShoppingItem } from "./domain";
import {
  activeMeals,
  itemKey,
  decisionKey,
  enabledCategories,
} from "./v2-state";
import type { State, Product, Purchase } from "./v2-state";
export const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    n,
  );
export function requirements(state: State) {
  return shoppingList(activeMeals(state), state.recipes, [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Snacks",
    "Sides",
  ]);
}
export function unquantifiedIngredients(state: State) {
  const names = new Map<string, Ingredient>();
  for (const meal of activeMeals(state)) {
    const recipe = state.recipes.find((r) => r.id === meal.recipeId);
    if (!recipe || !usable(recipe)) continue;
    for (const original of recipe.ingredients) {
      const i = meal.substitutions?.[original.name] ?? original;
      if (i.excludeFromShopping) names.set(i.name.toLowerCase(), i);
    }
  }
  return [...names.values()];
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const expired = (expiry?: string) => !!expiry && expiry < today();
export const purchaseIsCurrent = (p: Purchase) =>
  !p.prepared &&
  !expired(p.expiry) &&
  (!!p.expiry || Date.now() - Date.parse(p.at) <= 30 * 86400000);

export function preparedSafe(state: State, id: string, expiry?: string) {
  if (!state.v3?.safeStorage[id]) return false;
  const date = state.v3?.storageDates[id];
  const age = date ? Date.now() - Date.parse(date + "T00:00:00") : NaN;
  return (
    !!expiry &&
    !expired(expiry) &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 3 * 86400000
  );
}
export function available(state: State, key: string) {
  const prepared = key.endsWith("|prepared");
  const baseKey = prepared ? key.slice(0, -9) : key;
  const openingKey = state.v2.stock[key] ? key : baseKey;
  const base = state.v2.stock[openingKey];
  const opening =
    base?.quantity != null &&
    base.prepared === prepared &&
    !expired(base.expiry) &&
    (!prepared || preparedSafe(state, "stock/" + openingKey, base.expiry))
      ? Math.max(0, base.quantity - base.consumed)
      : 0;
  return (
    opening +
    state.v2.purchases
      .filter(
        (p) =>
          (p.key === key || p.key === baseKey) &&
          p.prepared === prepared &&
          (prepared
            ? preparedSafe(state, p.id, p.expiry)
            : purchaseIsCurrent(p)),
      )
      .reduce((sum, p) => sum + p.quantity - p.consumed, 0)
  );
}
export function inventory(
  state: State,
  key: string,
  required = requirements(state).find((i) => i.key === key)?.quantity ?? 0,
) {
  const prepared = key.endsWith("|prepared");
  const baseKey = prepared ? key.slice(0, -9) : key;
  const purchased = state.v2.purchases
    .filter(
      (p) => (p.key === key || p.key === baseKey) && p.prepared === prepared,
    )
    .reduce((sum, p) => sum + p.quantity, 0);
  const stock = available(state, key);
  const reserved = Math.min(stock, required);
  return {
    purchased,
    onHand: stock,
    reserved,
    available: Math.max(0, stock - reserved),
    shortage: Math.max(0, required - stock),
    consumed:
      state.v2.purchases
        .filter(
          (p) =>
            (p.key === key || p.key === baseKey) && p.prepared === prepared,
        )
        .reduce((sum, p) => sum + p.consumed, 0) +
      ((state.v2.stock[key] ?? state.v2.stock[baseKey])?.prepared === prepared
        ? ((state.v2.stock[key] ?? state.v2.stock[baseKey])?.consumed ?? 0)
        : 0),
  };
}
const stapleNames = [
  "olive oil",
  "vegetable oil",
  "salt",
  "pepper",
  "smoked paprika",
  "cinnamon",
  "dried oregano",
  "curry powder",
  "plain flour",
  "sugar",
  "rice",
  "pasta",
  "soy sauce",
  "vinegar",
  "baking powder",
];
export function stapleSuggested(state: State, name: string) {
  const normal = name.toLowerCase();
  return (
    stapleNames.includes(normal) ||
    state.v2.purchases.filter((p) => p.name.toLowerCase() === normal).length >=
      2
  );
}
export function isStaple(state: State, name: string) {
  return state.v2.staples[name.toLowerCase()] ?? false;
}
export function receipts(state: State, key: string) {
  return state.v2.purchases.filter(
    (p) => p.week === state.week && p.key === key,
  );
}
export function pantryStatus(state: State, i: ShoppingItem) {
  const d = state.v2.decisions[decisionKey(state, i.key)];
  const confirmed = d?.action === "enough" && d.quantity >= i.quantity;
  const believed =
    isStaple(state, i.name) ||
    state.pantry.some((p) => p.toLowerCase() === i.name.toLowerCase()) ||
    !!state.v2.stock[i.key] ||
    available(state, i.key) > 0;
  return {
    confirmed,
    check: !receipts(state, i.key).length && believed && d?.action !== "shop",
    required: i.quantity,
  };
}
const demo: Record<string, [number, number]> = {
  "chicken breast": [1000, 12],
  "beef mince": [500, 7],
  salmon: [500, 13],
  tuna: [185, 2.2],
  "olive oil": [500, 6],
  rice: [1000, 2.8],
  pasta: [500, 1.3],
  "rolled oats": [750, 2],
  "oat milk": [1000, 2.5],
  milk: [2000, 3.5],
  "greek yoghurt": [1000, 5],
  cheddar: [500, 6],
  feta: [200, 3.5],
  egg: [12, 6],
  "tinned tomatoes": [400, 1.1],
  chickpeas: [400, 1.2],
  "cannellini beans": [400, 1.2],
  "black beans": [400, 1.2],
  "red lentils": [500, 2.5],
  "firm tofu": [450, 3.5],
  "coconut milk": [400, 1.8],
  "plain flour": [1000, 1.5],
  "smoked paprika": [35, 2],
  cinnamon: [30, 2],
  "soy sauce": [250, 2],
  "wholemeal bread": [700, 3],
  "wholemeal wraps": [360, 3.5],
  banana: [1, 0.6],
  apple: [1, 0.8],
  pear: [1, 0.9],
  lemon: [1, 1],
  avocado: [1, 1.5],
  pumpkin: [1000, 3],
  potato: [1000, 3],
  "sweet potato": [1000, 4],
  broccoli: [500, 3],
  carrot: [1000, 2],
  zucchini: [500, 3],
  spinach: [120, 3],
  tomato: [500, 4],
  cucumber: [500, 2.5],
  capsicum: [500, 4],
  onion: [1000, 2.5],
  mushrooms: [250, 4],
  "green beans": [500, 4],
  blueberries: [125, 4],
  strawberries: [250, 4],
  hummus: [200, 3],
  "peanut butter": [375, 3],
  sweetcorn: [300, 1.5],
  quinoa: [500, 4],
  "arborio rice": [500, 3],
  "dried oregano": [15, 2],
  "curry powder": [50, 2],
  ginger: [100, 2],
};
export function productFor(state: State, i: ShoppingItem): Product | undefined {
  if (state.v3) {
    const product = chooseStoreProduct(
      state,
      i,
      Math.max(0, i.quantity - available(state, i.key)),
    );
    const fallback = estimateIngredient(i);
    const overrideKey = `${productSelectionKey(state, i.key)}/${product?.id ?? "generic"}`;
    const override = shoppingPreferences(state).priceOverrides[overrideKey];
    if (!product)
      return override !== undefined
        ? {
            ...(fallback ?? {
              size: i.unit === "each" ? 1 : i.quantity || 1,
              source: "user" as const,
            }),
            price: override,
            source: "user" as const,
            priceLabel: "User price",
          }
        : fallback;
    const status = priceStatus(product);
    const known =
      !["Unknown price", "Unverified imported price"].includes(status) &&
      product.price !== undefined;
    const estimated = estimateIngredient(i, product.size);
    const unitPrice = override ?? (known ? product.price : estimated?.price);
    const label =
      override !== undefined
        ? "User price"
        : known
          ? status === "User-entered price"
            ? "User price"
            : status === "Confirmed current price"
              ? "Catalogue price"
              : status.includes("retrieved")
                ? "Previous price"
                : status === "Demonstration price"
                  ? "Estimated price"
                  : status
          : estimated
            ? "Estimated price"
            : "Price unknown";
    return {
      size: product.size,
      price: unitPrice,
      source: label === "Estimated price" ? "estimate" : "user",
      shop: assignedStore(state, i.key)?.name,
      name: product.name,
      storeId: product.storeId,
      productId: product.id,
      priceLabel: label,
      availabilityLabel: availabilityLabel(product),
      unavailable: unavailable(product),
      observedAt: product.observedAt,
      special: genuineSpecial(product),
    };
  }

  return (
    state.v2.products[i.key] ??
    (demo[i.name.toLowerCase()]
      ? {
          size: demo[i.name.toLowerCase()][0],
          price: demo[i.name.toLowerCase()][1],
          source: "demo",
          shop: "Example pack — not live supermarket data",
        }
      : undefined)
  );
}
export function recommendation(state: State, i: ShoppingItem) {
  const d = pantryStatus(state, i);
  const shortage = d.confirmed
    ? 0
    : inventory(state, i.key, i.quantity).shortage;
  const product = productFor(state, i);
  const packs = product
    ? Math.ceil(Number((shortage / product.size).toFixed(8)))
    : 0;
  return {
    product,
    shortage,
    packs,
    buy: product ? packs * product.size : shortage,
    cost:
      product?.price === undefined || product.unavailable
        ? undefined
        : packs * product.price,
  };
}
export function budget(state: State, items = requirements(state)) {
  let total = 0,
    missing = activeMeals(state).filter(
      (m) =>
        m.recipeId &&
        !state.recipes.some((r) => r.id === m.recipeId && usable(r)),
    ).length,
    uncertain = 0,
    demoUsed = false,
    estimated = 0;
  for (const p of state.v2.purchases.filter((p) => p.week === state.week)) {
    if (p.price !== undefined) {
      total += p.price;
      continue;
    }
    const i = { ...p, key: p.key };
    const product = productFor(state, i);
    if (product?.price !== undefined) {
      total += Math.ceil(p.quantity / product.size) * product.price;
      demoUsed ||= product.source === "demo";
      if (product.source === "estimate") estimated++;
    } else missing++;
  }
  for (const i of items) {
    const status = pantryStatus(state, i);
    const opening = state.v2.stock[i.key];
    const quantified = opening?.quantity != null || available(state, i.key) > 0;
    if (status.check && !status.confirmed && !quantified) {
      uncertain++;
      continue;
    }
    const rec = recommendation(state, i);
    if (rec.shortage > 0) {
      if (rec.cost === undefined) missing++;
      else {
        total += rec.cost;
        demoUsed ||= rec.product?.source === "demo";
        if (rec.product?.source === "estimate") estimated++;
      }
    }
  }
  const limit = state.v2.budgets[state.week];
  return {
    total,
    missing,
    uncertain,
    partial:
      missing > 0 || uncertain > 0 || unquantifiedIngredients(state).length > 0,
    demoUsed,
    estimated,
    limit,
    remaining: limit === undefined || limit === null ? null : limit - total,
  };
}
export function recordPurchase(
  state: State,
  i: ShoppingItem,
  quantity: number,
  price?: number,
  expiry?: string,
  prepared = !!i.prepared,
): State {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    (price !== undefined && (!Number.isFinite(price) || price < 0))
  )
    throw Error("Enter a positive quantity and a valid price.");
  const purchaseKey =
    i.key.replace(/\|prepared$/, "") + (prepared ? "|prepared" : "");
  const purchase: Purchase = {
    id: crypto.randomUUID(),
    week: state.week,
    key: purchaseKey,
    name: i.name,
    department: i.department,
    unit: i.unit,
    quantity,
    price,
    expiry,
    prepared,
    consumed: 0,
    storeId: assignedStore(state, i.key)?.id,
    productId: productFor(state, i)?.productId,
    at: new Date().toISOString(),
  };
  return {
    ...state,
    checked: [...new Set([...state.checked, purchaseKey])],
    v2: {
      ...state.v2,
      purchases: [...state.v2.purchases, purchase],
      decisions: {
        ...state.v2.decisions,
        [decisionKey(state, i.key)]: { action: "shop", quantity: i.quantity },
      },
    },
  };
}
export type Change = "new" | "increased" | "reduced" | "removed" | "same";
export function changes(
  state: State,
): Array<ShoppingItem & { change: Change; previous: number }> {
  const current = requirements(state);
  const baseline = state.v2.baseline[state.week] ?? current;
  const map = new Map(current.map((i) => [i.key, i]));
  return [
    ...current.map((i) => {
      const prev = baseline.find((b) => b.key === i.key);
      return {
        ...i,
        previous: prev?.quantity ?? 0,
        change: (!prev
          ? "new"
          : i.quantity > prev.quantity + 1e-8
            ? "increased"
            : i.quantity < prev.quantity - 1e-8
              ? "reduced"
              : "same") as Change,
      };
    }),
    ...baseline
      .filter((i) => !map.has(i.key))
      .map((i) => ({
        ...i,
        previous: i.quantity,
        quantity: 0,
        change: "removed" as Change,
      })),
  ];
}
export function acknowledgeChanges(state: State): State {
  return {
    ...state,
    v2: {
      ...state.v2,
      baseline: { ...state.v2.baseline, [state.week]: requirements(state) },
    },
  };
}
export function affectedMeals(state: State, key: string) {
  return activeMeals(state).filter((m) => {
    const r = state.recipes.find((r) => r.id === m.recipeId);
    return r?.ingredients.some(
      (original) =>
        itemKey({
          ...(m.substitutions?.[original.name] ?? original),
          prepared:
            r.preparedIngredients?.includes(original.name) || original.prepared,
        }) === key,
    );
  });
}
export function replaceMeal(
  state: State,
  meal: Meal,
  recipe: Recipe,
  confirmLocked = false,
): State {
  if (meal.locked && !confirmLocked)
    throw Error("Confirm replacement of this locked meal first.");
  if (recipe.category !== meal.category)
    throw Error("Replacement must use the same meal category.");
  if (
    !matches(recipe, planningSettings(state)) ||
    planningAllergies(state).some((a) =>
      [
        ...recipe.ingredients.map((i) => i.name),
        ...(recipe.allergens ?? []),
      ].some((name) => name.toLowerCase().includes(a.toLowerCase())),
    )
  )
    throw Error("Recipe does not match household preferences.");
  return {
    ...state,
    plan: state.plan.map((m) =>
      m.day === meal.day && m.category === meal.category
        ? {
            ...m,
            ...generationPortions(state, m),
            recipeId: recipe.id,
            substitutions: undefined,
            cooked: false,
          }
        : m,
    ),
  };
}
export const substitutions: Record<
  string,
  { name: string; instructions: string }[]
> = {
  Spinach: [
    {
      name: "Baby spinach",
      instructions:
        "Wash the baby spinach and use the same wilting step and quantity.",
    },
  ],
  Carrot: [
    {
      name: "Purple carrot",
      instructions:
        "Peel, cut or grate the purple carrot exactly as the original carrot.",
    },
  ],
  Onion: [
    {
      name: "Brown onion",
      instructions:
        "Peel and dice the brown onion, then use the same softening step.",
    },
  ],
  Lemon: [
    {
      name: "Lime",
      instructions:
        "Use the same quantity of lime juice or slices in the original lemon step.",
    },
  ],
};
export function substitutionOptions(state: State, i: ShoppingItem) {
  if (i.prepared) return [];
  return (substitutions[i.name] ?? []).filter(
    (option) =>
      ![
        ...planningAllergies(state),
        ...planningSettings(state).dislikes.split(","),
      ]
        .filter((a) => a.trim())
        .some((a) =>
          option.name.toLowerCase().includes(a.trim().toLowerCase()),
        ),
  );
}
export function substitute(
  state: State,
  i: ShoppingItem,
  replacement: string,
  confirmLocked = false,
): State {
  const option = substitutionOptions(state, i).find(
    (o) => o.name === replacement,
  );
  if (!option) throw Error("No verified substitution instructions available.");
  const affected = affectedMeals(state, i.key);
  if (affected.some((m) => m.locked) && !confirmLocked)
    throw Error("Confirm substitution in locked meals first.");
  const plan = state.plan.map((m) => {
    if (!affected.includes(m)) return m;
    const r = state.recipes.find((r) => r.id === m.recipeId)!;
    const mappings = { ...m.substitutions };
    for (const original of r.ingredients) {
      const effective = mappings[original.name] ?? original;
      if (itemKey(effective) === i.key)
        mappings[original.name] = {
          ...effective,
          name: replacement,
          rawMeasure: option.instructions,
        };
    }
    return { ...m, substitutions: mappings };
  });
  return { ...state, plan };
}
export function sendToOtherShop(
  state: State,
  key: string,
  shop: string,
): State {
  if (!shop.trim()) throw Error("Enter a shop name");
  return {
    ...state,
    v2: {
      ...state.v2,
      otherShops: {
        ...state.v2.otherShops,
        [decisionKey(state, key)]: shop.trim(),
      },
    },
  };
}
export function mealCost(
  state: State,
  r: Recipe,
  people = planningSettings(state).people,
  appetite = planningSettings(state).appetite,
) {
  let cost = 0,
    missing = 0;
  for (const i of r.ingredients.filter((i) => !i.excludeFromShopping)) {
    const product = productFor(state, { ...i, key: itemKey(i) });
    if (!product || product.price === undefined) {
      missing++;
      continue;
    }
    const needed = scaleQuantity(i.quantity, r.servings, people, appetite);
    cost +=
      Math.ceil(
        Math.max(0, needed - available(state, itemKey(i))) / product.size,
      ) * product.price;
  }
  return { cost, missing };
}
export function rankedRecipes(state: State, meal: Meal, cheap = false) {
  const options = state.recipes.filter(
    (r) =>
      r.category === meal.category &&
      discoverable(r) &&
      r.origin !== "ai" &&
      matches(r, planningSettings(state)) &&
      !planningAllergies(state).some((a) =>
        [...r.ingredients.map((i) => i.name), ...(r.allergens ?? [])].some(
          (name) => name.toLowerCase().includes(a.toLowerCase()),
        ),
      ),
  );
  const portions = generationPortions(state, meal);
  return options.sort((a, b) => {
    const ac = mealCost(state, a, portions.people, portions.appetite),
      bc = mealCost(state, b, portions.people, portions.appetite);
    const ap = ac.missing * 1000 + ac.cost,
      bp = bc.missing * 1000 + bc.cost;
    const used = (r: Recipe) =>
      (state.v2.recent.includes(r.id) ||
        state.plan.some((m) => m.recipeId === r.id)) &&
      !r.favourite
        ? 1
        : 0;
    return cheap ? ap - bp : used(a) - used(b) || ap - bp;
  });
}
export function smartGenerate(state: State): State {
  if (state.v3) return generateStorePlan(state);

  let next = { ...state, plan: [...state.plan] };
  const used = new Set<string>();
  const recent = [...state.v2.recent];
  for (let day = 0; day < 7; day++)
    for (const category of enabledCategories(state, day)) {
      const old = next.plan.find(
        (m) => m.day === day && m.category === category,
      );
      if (old?.locked || old?.cooked) continue;
      const meal = {
        ...(old ?? { day, category, recipeId: null, locked: false }),
        ...generationPortions(state, old),
      };
      const options = rankedRecipes(next, meal);
      const pool = options.filter((r) => !used.has(r.id) || r.favourite);
      const r = (pool.length ? pool : options)[0];
      if (r) {
        used.add(r.id);
        recent.push(r.id);
      }
      next.plan = next.plan
        .filter((m) => !(m.day === day && m.category === category))
        .concat({ ...meal, recipeId: r?.id ?? null, substitutions: undefined });
    }
  return {
    ...next,
    v2: { ...next.v2, recent: [...new Set(recent.slice(-250))] },
  };
}
export function convertQuantity(
  value: number,
  from: string,
  to: string,
): number | undefined {
  const units: Record<string, { base: string; factor: number }> = {
    kg: { base: "g", factor: 1000 },
    g: { base: "g", factor: 1 },
    l: { base: "ml", factor: 1000 },
    ml: { base: "ml", factor: 1 },
    each: { base: "each", factor: 1 },
  };
  const a = units[from.toLowerCase()],
    b = units[to.toLowerCase()];
  return a && b && a.base === b.base
    ? (value * a.factor) / b.factor
    : undefined;
}
export function consumeMeal(state: State, meal: Meal): State {
  if (meal.cooked)
    throw Error("This meal has already been recorded as cooked.");
  const r = state.recipes.find((r) => r.id === meal.recipeId);
  if (!r || !usable(r)) throw Error("No validated recipe selected");
  const needs = shoppingList([{ ...meal, day: 0 }], state.recipes, [
    meal.category,
  ]);
  for (const i of needs)
    if (available(state, i.key) + 1e-8 < i.quantity)
      throw Error(
        `Not enough quantified ${i.name} in inventory. Correct stock or record its purchase first.`,
      );
  const stock = structuredClone(state.v2.stock),
    purchases = structuredClone(state.v2.purchases);
  for (const i of needs) {
    let remaining = i.quantity;
    const baseKey = i.key.endsWith("|prepared") ? i.key.slice(0, -9) : i.key;
    const wantsPrepared = !!i.prepared;
    const openingKey = stock[i.key] ? i.key : baseKey;
    const base = stock[openingKey];
    if (
      base?.quantity !== null &&
      base &&
      base.prepared === wantsPrepared &&
      !expired(base.expiry) &&
      (!wantsPrepared ||
        preparedSafe(state, "stock/" + openingKey, base.expiry))
    ) {
      const take = Math.min(remaining, base.quantity - base.consumed);
      base.consumed += take;
      remaining -= take;
    }
    const lots = purchases
      .filter(
        (p) =>
          (p.key === i.key || p.key === baseKey) &&
          p.prepared === wantsPrepared &&
          (wantsPrepared
            ? preparedSafe(state, p.id, p.expiry)
            : purchaseIsCurrent(p)),
      )
      .sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
    for (const p of lots) {
      const take = Math.min(remaining, p.quantity - p.consumed);
      p.consumed += take;
      remaining -= take;
    }
  }
  return {
    ...state,
    plan: state.plan.map((m) =>
      m.day === meal.day && m.category === meal.category
        ? { ...m, cooked: true }
        : m,
    ),
    v2: { ...state.v2, stock, purchases },
  };
}

// Evaluate full-package basket deltas, not fractional ingredient costs. Locked
// meals, purchased stock and existing assignments are part of every evaluation.
export function generateStorePlan(state: State): State {
  if (storeRequired(state))
    throw Error(
      "Choose a supermarket and specific store before generating meals.",
    );
  let next: State = { ...state, plan: [...state.plan] };
  const used = new Set(
    next.plan.filter((m) => m.locked || m.cooked).map((m) => m.recipeId),
  );
  const recent = [...state.v2.recent];
  for (let day = 0; day < 7; day++)
    for (const category of enabledCategories(state, day)) {
      const old = next.plan.find(
        (m) => m.day === day && m.category === category,
      );
      if (old?.locked || old?.cooked) continue;
      const meal = {
        ...(old ?? { day, category, recipeId: null, locked: false }),
        ...generationPortions(state, old),
      };
      const candidates = rankedRecipes(state, meal, true)
        .filter((r) => !used.has(r.id) || r.favourite)
        .filter((r) =>
          r.ingredients.every(
            (i) =>
              available(state, itemKey(i)) >=
                scaleQuantity(
                  i.quantity,
                  r.servings,
                  meal.people,
                  meal.appetite,
                ) || !productFor(state, { ...i, key: itemKey(i) })?.unavailable,
          ),
        );
      const scored = candidates
        .map((r) => {
          const plan = next.plan
            .filter((m) => m.day !== day || m.category !== category)
            .concat({ ...meal, recipeId: r.id, substitutions: undefined });
          const candidate = { ...next, plan };
          const estimate = budget(candidate);
          const repeat = state.v2.recent.includes(r.id) && !r.favourite ? 1 : 0;
          return { r, candidate, estimate, score: estimate.total + repeat };
        })
        .filter(
          (c) =>
            c.estimate.limit == null ||
            c.estimate.total <= c.estimate.limit ||
            c.estimate.total < budget(next).total,
        )
        .sort(
          (a, b) =>
            a.estimate.missing - b.estimate.missing || a.score - b.score,
        );
      const pick = scored[0];
      if (pick) {
        next = pick.candidate;
        used.add(pick.r.id);
        recent.push(pick.r.id);
      } else if (!old) next.plan.push(meal);
    }
  return {
    ...next,
    v2: { ...next.v2, recent: [...new Set(recent.slice(-250))] },
  };
}
