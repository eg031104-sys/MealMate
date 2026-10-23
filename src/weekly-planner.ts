import { matches, type Meal, type Recipe } from "./domain";
import { discoverable } from "./catalogue";
import { dateForDay, enabledCategories, type State } from "./v2-state";
import {
  preferencesSchema,
  generationPortions,
  planningData,
  planningSettings,
  planningAllergies,
  type PlanningPreferences,
} from "./planning-model";
import { budget, available, productFor } from "./shopping";
import { selectedStore, supermarketData } from "./supermarkets";
import { itemKey } from "./v2-state";
import { scaleQuantity } from "./domain";
export function planningWeekStart(value: string) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function preferencesFor(s: State): PlanningPreferences {
  const p = s.planning?.weeks[s.week] ?? s.planning?.last;
  const explicit = s.v3?.weekStores[s.week];
  return {
    people: p?.people ?? s.settings.people,
    appetite: p?.appetite ?? s.settings.appetite,
    diet: p?.diet ?? s.settings.diet,
    appliances: p?.appliances ?? s.settings.appliances,
    maxTime: p?.maxTime ?? s.settings.maxTime,
    categories:
      p?.categories ?? s.settings.categories.filter((c) => c !== "Sides"),
    allergies: p?.allergies ?? [],
    storeId: explicit ?? selectedStore(s)?.id ?? p?.storeId ?? null,
    budget:
      s.v2.budgets[s.week] !== undefined
        ? s.v2.budgets[s.week]
        : (p?.budget ?? null),
  };
}
export function savePlanningPreferences(
  s: State,
  raw: PlanningPreferences,
): State {
  const p = preferencesSchema.parse(raw),
    data = supermarketData(s);
  if (!p.storeId || !data.stores.some((x) => x.id === p.storeId))
    throw Error(
      "Choose a saved supermarket and specific store. The existing finder is available under Supermarkets.",
    );
  const planning = planningData(s);
  return {
    ...s,
    planning: {
      ...planning,
      last: p,
      weeks: { ...planning.weeks, [s.week]: p },
    },
    v2: { ...s.v2, budgets: { ...s.v2.budgets, [s.week]: p.budget } },
    v3: { ...data, weekStores: { ...data.weekStores, [s.week]: p.storeId } },
  };
}
export function eligibleRecipe(s: State, r: Recipe) {
  return (
    discoverable(r) &&
    matches(r, planningSettings(s)) &&
    !planningAllergies(s).some((a) =>
      [...r.ingredients.map((i) => i.name), ...(r.allergens ?? [])].some(
        (name) => name.toLowerCase().includes(a),
      ),
    )
  );
}
export function recentDinnerIds(s: State, days = 21, targetDate = s.week) {
  const ids = new Set<string>(),
    start = Date.parse(targetDate + "T12:00:00Z");
  const recent = (date: string) => {
    const elapsed = (start - Date.parse(date + "T12:00:00Z")) / 86400000;
    return elapsed > 0 && elapsed < days;
  };
  for (const [week, w] of Object.entries(s.v2.weeks))
    if (week !== s.week)
      for (const m of w.plan)
        if (
          m.category === "Dinner" &&
          m.recipeId &&
          recent(dateForDay(week, m.day))
        )
          ids.add(m.recipeId);
  for (const h of planningData(s).history)
    if (h.category === "Dinner" && recent(h.date)) ids.add(h.recipeId);
  for (const h of s.v3?.independentMeals ?? [])
    if (
      recent(h.at.slice(0, 10)) &&
      s.recipes.some((r) => r.id === h.recipeId && r.category === "Dinner")
    )
      ids.add(h.recipeId);
  return ids;
}
export function weightedRecipe<T extends { r: Recipe; cost?: number }>(
  choices: T[],
  random: () => number = Math.random,
): T | undefined {
  const lowest = Math.min(...choices.map((c) => c.cost ?? 0));
  const weights = choices.map(
    (c) =>
      (c.r.favourite ? 3 : 1) / (1 + Math.max(0, (c.cost ?? 0) - lowest) / 10),
  );
  let n =
    Math.min(0.999999999, Math.max(0, random())) *
    weights.reduce((a, b) => a + b, 0);
  return choices.find((_, i) => (n -= weights[i]) < 0) ?? choices.at(-1);
}
export type ScheduleConflict = { message: string; recipeIds: string[] };
export function generateWeeklyPlan(
  state: State,
  prefs: PlanningPreferences,
  options: {
    confirmReplace?: boolean;
    resetPortions?: boolean;
    random?: () => number;
  } = {},
) {
  if (
    state.plan.some((m) => m.recipeId && !m.locked && !m.cooked) &&
    !options.confirmReplace
  )
    throw Error(
      "Confirm replacing the existing unlocked plan before generating.",
    );
  if (planningWeekStart(state.week) !== state.week)
    throw Error(
      "Choose a Monday as the planning week start. Your existing saved plan is kept.",
    );
  let next = savePlanningPreferences(state, prefs);
  const random = options.random ?? Math.random;
  const warnings = new Set<string>(),
    conflicts: ScheduleConflict[] = [];
  // Retain disabled categories, daily overrides, completed meals, locks and their portions.
  const protectedMeals = state.plan.filter(
    (m) =>
      m.locked ||
      m.cooked ||
      !enabledCategories(next, m.day).includes(m.category),
  );
  const plan = [...protectedMeals],
    used = new Set(
      protectedMeals
        .filter((m) => enabledCategories(next, m.day).includes(m.category))
        .map((m) => m.recipeId),
    );
  const slots: Meal[] = [];
  for (let day = 0; day < 7; day++)
    for (const category of enabledCategories(next, day)) {
      if (plan.some((m) => m.day === day && m.category === category)) continue;
      const old = state.plan.find(
        (m) => m.day === day && m.category === category,
      );
      slots.push({
        day,
        category,
        recipeId: null,
        ...generationPortions(next, options.resetPortions ? undefined : old),
        locked: false,
      });
    }
  const eligible = next.recipes.filter((r) => eligibleRecipe(next, r));
  for (const m of protectedMeals.filter(
    (m) =>
      m.locked &&
      !m.cooked &&
      enabledCategories(next, m.day).includes(m.category),
  )) {
    const r = next.recipes.find((r) => r.id === m.recipeId);
    if (r && !eligible.includes(r))
      warnings.add(
        `${r.name}: this locked meal does not match the current planning restrictions. It was kept; review or unlock it before cooking.`,
      );
  }
  const obtainable = (r: Recipe, m: Meal) =>
    r.ingredients
      .filter((i) => !i.excludeFromShopping)
      .every(
        (i) =>
          available(next, itemKey(i)) >=
            scaleQuantity(i.quantity, r.servings, m.people, m.appetite) ||
          !productFor(next, { ...i, key: itemKey(i) })?.unavailable,
      );
  const repeats = next.recipes.filter(
    (r) => r.repeat && r.repeat.mode !== "normal",
  );
  const fixed = repeats.filter((r) => r.repeat?.mode === "weekly-fixed");
  const groups = new Map<string, Recipe[]>();
  for (const r of fixed) {
    const day = r.repeat!.mode === "weekly-fixed" ? r.repeat!.day : 0;
    const key = `${day}/${r.category}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  function assign(r: Recipe, m: Meal) {
    m.recipeId = r.id;
    used.add(r.id);
  }
  for (const [key, recipes] of groups) {
    const r = recipes[0],
      day = Number(key.split("/")[0]);
    if (recipes.length > 1) {
      conflicts.push({
        message: `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day]} ${r.category}: ${recipes.map((r) => r.name).join(" and ")} both request this slot. Change a repeat setting to resolve it.`,
        recipeIds: recipes.map((r) => r.id),
      });
      continue;
    }
    const protectedMeal = plan.find(
      (m) => m.day === day && m.category === r.category,
    );
    if (protectedMeal?.recipeId === r.id) {
      continue;
    }
    const slot = slots.find((m) => m.day === day && m.category === r.category);
    if (!slot || protectedMeal) {
      conflicts.push({
        message: `${r.name}: fixed ${r.category} slot is disabled, locked or already cooked. Change its repeat setting or the day settings.`,
        recipeIds: [r.id],
      });
      continue;
    }
    if (!eligible.includes(r) || !obtainable(r, slot) || used.has(r.id)) {
      conflicts.push({
        message: `${r.name}: weekly repeat conflicts with current dietary, allergy, appliance, time or product restrictions, or is already protected elsewhere.`,
        recipeIds: [r.id],
      });
      continue;
    }
    assign(r, slot);
  }
  for (const r of repeats.filter((r) => r.repeat?.mode === "weekly-random")) {
    if (used.has(r.id)) continue;
    const free = slots.filter(
      (m) => m.category === r.category && !m.recipeId && obtainable(r, m),
    );
    if (!eligible.includes(r) || !free.length) {
      conflicts.push({
        message: `${r.name}: no eligible free ${r.category} slot for its weekly repeat. Change its repeat setting or planning filters.`,
        recipeIds: [r.id],
      });
      continue;
    }
    assign(
      r,
      free[
        Math.min(
          free.length - 1,
          Math.floor(Math.max(0, random()) * free.length),
        )
      ],
    );
  }
  if (conflicts.length)
    return { state, warnings: [], conflicts, filled: 0, empty: 0 };
  for (const m of slots) {
    if (m.recipeId) continue;
    let pool = eligible.filter(
      (r) => r.category === m.category && obtainable(r, m),
    );
    const fresh = pool.filter((r) => !used.has(r.id));
    if (fresh.length) pool = fresh;
    else if (pool.length)
      warnings.add(
        `${m.category}: repeats were unavoidable with the eligible recipe library.`,
      );
    if (m.category === "Dinner") {
      const recent = recentDinnerIds(next, 21, dateForDay(next.week, m.day));
      const cooled = pool.filter((r) => !recent.has(r.id));
      if (cooled.length) pool = cooled;
      else if (pool.length)
        warnings.add(
          "Dinner: the 21-day cooldown was relaxed because too few eligible recipes remained.",
        );
    } else {
      const notRecent = pool.filter((r) => !state.v2.recent.includes(r.id));
      if (notRecent.length) pool = notRecent;
    }
    if (!pool.length) {
      warnings.add(
        `${m.category}: no eligible recipe for one or more slots. Dietary, allergy, appliance and time restrictions were kept.`,
      );
      continue;
    }
    const withRepeats = [...plan, ...slots.filter((s) => s.recipeId)];
    const scored = pool.map((r) => {
      const estimate = budget({
        ...next,
        plan: [...withRepeats, { ...m, recipeId: r.id }],
      });
      return { r, cost: estimate.total, estimate };
    });
    const within = scored.filter(
      (c) => c.estimate.limit == null || c.cost <= c.estimate.limit,
    );
    const pick = weightedRecipe(within.length ? within : scored, random)!;
    assign(pick.r, m);
  }
  const finalPlan = [...plan, ...slots].sort(
    (a, b) => a.day - b.day || a.category.localeCompare(b.category),
  );
  next = {
    ...next,
    plan: finalPlan,
    v2: {
      ...next.v2,
      recent: [
        ...new Set([
          ...next.v2.recent,
          ...slots.flatMap((m) => (m.recipeId ? [m.recipeId] : [])),
        ]),
      ].slice(-250),
    },
  };
  const b = budget(next);
  if (b.partial)
    warnings.add(
      "Shopping cost is a partial estimate; some quantities or prices need checking.",
    );
  if (b.remaining !== null && b.remaining < 0)
    warnings.add(
      "The shopping estimate exceeds this week’s budget. Review meals or quantities; purchases are preserved.",
    );
  const messages = [...warnings];
  next = {
    ...next,
    planning: {
      ...planningData(next),
      reports: { ...planningData(next).reports, [next.week]: messages },
    },
  };
  return {
    state: next,
    warnings: messages,
    conflicts,
    filled: slots.filter((m) => m.recipeId).length,
    empty: slots.filter((m) => !m.recipeId).length,
  };
}
