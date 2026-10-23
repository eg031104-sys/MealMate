import type { Meal } from "./domain";
import { dateForDay, type State } from "./v2-state";
import {
  planningData,
  historySchema,
  type CookedEntry,
} from "./planning-model";
import { consumeMeal, today } from "./shopping";
function validateDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    isNaN(Date.parse(date)) ||
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
  )
    throw Error("Choose a valid actual cooking date.");
  if (date > today()) throw Error("A cooked meal cannot have a future date.");
}
function localDate(at: string) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const slotKey = (week: string, day: number, category: string) =>
  `${week}/${day}/${category}`;
function weekPlan(s: State, week: string) {
  return week === s.week ? s.plan : (s.v2.weeks[week]?.plan ?? []);
}
function updateMeal(
  s: State,
  week: string,
  day: number,
  category: string,
  cooked: boolean,
): State {
  const plan = weekPlan(s, week).map((m) =>
    m.day === day && m.category === category ? { ...m, cooked } : m,
  );
  return week === s.week
    ? { ...s, plan }
    : {
        ...s,
        v2: {
          ...s.v2,
          weeks: { ...s.v2.weeks, [week]: { ...s.v2.weeks[week], plan } },
        },
      };
}
export function confirmCooked(
  s: State,
  week: string,
  meal: Meal,
  date: string,
  consume = false,
): State {
  validateDate(date);
  const saved = weekPlan(s, week).find(
    (m) => m.day === meal.day && m.category === meal.category,
  );
  if (!saved?.recipeId)
    throw Error("Choose a recipe before recording cooking.");
  const id = slotKey(week, meal.day, meal.category);
  if (saved.cooked || planningData(s).history.some((h) => h.id === id))
    throw Error(
      "This meal is already confirmed cooked. Correct its history entry instead.",
    );
  let next = s;
  const stockDeltas: Record<string, number> = {},
    purchaseDeltas: Record<string, number> = {};
  if (consume) {
    if (week !== s.week)
      throw Error(
        "Inventory consumption is available for the selected week only.",
      );
    next = consumeMeal(s, saved);
    for (const [key, lot] of Object.entries(next.v2.stock)) {
      const delta = lot.consumed - (s.v2.stock[key]?.consumed ?? 0);
      if (delta > 0) stockDeltas[key] = delta;
    }
    for (const p of next.v2.purchases) {
      const delta =
        p.consumed - (s.v2.purchases.find((x) => x.id === p.id)?.consumed ?? 0);
      if (delta > 0) purchaseDeltas[p.id] = delta;
    }
  }
  const entry: CookedEntry = historySchema.parse({
    id,
    week,
    day: meal.day,
    category: meal.category,
    recipeId: saved.recipeId,
    date,
    people: saved.people,
    appetite: saved.appetite,
    ...(consume ? { stockDeltas, purchaseDeltas } : {}),
  });
  next = updateMeal(next, week, meal.day, meal.category, true);
  return {
    ...next,
    planning: {
      ...planningData(next),
      history: [...planningData(next).history, entry],
    },
  };
}
export function correctCookedDate(s: State, id: string, date: string): State {
  validateDate(date);
  const data = planningData(s),
    entry = data.history.find((h) => h.id === id);
  if (!entry) throw Error("History entry not found.");
  const updated = historySchema.parse({ ...entry, date });
  return {
    ...s,
    planning: {
      ...data,
      history: data.history.map((h) => (h.id === id ? updated : h)),
    },
  };
}
export function removeCookedEntry(
  s: State,
  id: string,
  restoreStock = true,
): State {
  const data = planningData(s),
    h = data.history.find((h) => h.id === id);
  if (!h) throw Error("History entry not found.");
  let next = s;
  if (restoreStock && (h.stockDeltas || h.purchaseDeltas)) {
    const stock = structuredClone(s.v2.stock),
      purchases = structuredClone(s.v2.purchases);
    for (const [key, n] of Object.entries(h.stockDeltas ?? {})) {
      if (!stock[key] || stock[key].consumed + 1e-8 < n)
        throw Error(
          "Inventory lots changed. Review Pantry or choose removal without changing stock.",
        );
      stock[key].consumed = Math.max(0, stock[key].consumed - n);
    }
    for (const [id, n] of Object.entries(h.purchaseDeltas ?? {})) {
      const p = purchases.find((p) => p.id === id);
      if (!p || p.consumed + 1e-8 < n)
        throw Error(
          "Inventory lots changed. Review Pantry or choose removal without changing stock.",
        );
      p.consumed = Math.max(0, p.consumed - n);
    }
    next = { ...s, v2: { ...s.v2, stock, purchases } };
  }
  next = updateMeal(next, h.week, h.day, h.category, false);
  return {
    ...next,
    planning: {
      ...planningData(next),
      history: data.history.filter((x) => x.id !== id),
    },
  };
}
export type MealHistoryRow = {
  id: string;
  recipeId: string;
  date: string;
  week: string;
  meal: Meal;
  status: "planned" | "cooked" | "legacy" | "independent";
  entry?: CookedEntry;
};
export function mealHistory(s: State): MealHistoryRow[] {
  const data = planningData(s),
    rows: MealHistoryRow[] = data.history.map((h) => ({
      id: h.id,
      recipeId: h.recipeId,
      date: h.date,
      week: h.week,
      meal: {
        day: h.day,
        category: h.category,
        recipeId: h.recipeId,
        people: h.people,
        appetite: h.appetite,
        locked: false,
        cooked: true,
      },
      status: "cooked",
      entry: h,
    }));
  const weeks = {
    ...s.v2.weeks,
    [s.week]: { plan: s.plan, checked: s.checked },
  };
  for (const [week, w] of Object.entries(weeks))
    for (const meal of w.plan) {
      if (
        !meal.recipeId ||
        data.history.some(
          (h) => h.id === slotKey(week, meal.day, meal.category),
        )
      )
        continue;
      rows.push({
        id: slotKey(week, meal.day, meal.category),
        recipeId: meal.recipeId,
        date: dateForDay(week, meal.day),
        week,
        meal,
        status: meal.cooked ? "legacy" : "planned",
      });
    }
  for (const h of s.v3?.independentMeals ?? []) {
    const r = s.recipes.find((r) => r.id === h.recipeId);
    if (!r) continue;
    rows.push({
      id: "independent/" + h.id,
      recipeId: h.recipeId,
      date: localDate(h.at),
      week: localDate(h.at),
      meal: {
        day: 0,
        category: r.category,
        recipeId: r.id,
        people: h.people,
        appetite: h.appetite,
        locked: false,
        cooked: true,
      },
      status: "independent",
    });
  }
  return rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.meal.category.localeCompare(b.meal.category),
  );
}
// Legacy confirmations lack consumption ledgers; make the limit explicit.
export function editLegacyHistory(
  s: State,
  row: MealHistoryRow,
  date: string | null,
): State {
  if (row.status === "independent") {
    if (date) validateDate(date);
    const id = row.id.slice("independent/".length);
    return {
      ...s,
      v3: {
        ...s.v3!,
        independentMeals: s.v3!.independentMeals.flatMap((h) =>
          h.id !== id
            ? [h]
            : date
              ? [{ ...h, at: date + "T12:00:00.000Z" }]
              : [],
        ),
      },
    };
  }
  if (!date)
    return updateMeal(s, row.week, row.meal.day, row.meal.category, false);
  // Replace the legacy boolean with an explicit, dated confirmation without touching stock.
  return confirmCooked(
    updateMeal(s, row.week, row.meal.day, row.meal.category, false),
    row.week,
    { ...row.meal, cooked: false },
    date,
  );
}
