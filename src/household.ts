import type { State } from "./v2-state";
import type { Meal } from "./domain";
export function customised(state: State, m: Meal) {
  return (
    m.portionOverride ??
    (m.people !== state.settings.people ||
      m.appetite !== state.settings.appetite)
  );
}
export function servingCounts(state: State) {
  const meals = state.plan.filter((m) => !m.cooked);
  return {
    all: meals.length,
    defaults: meals.filter((m) => !customised(state, m)).length,
    custom: meals.filter((m) => customised(state, m)).length,
  };
}
export function updateHousehold(
  state: State,
  people: number,
  appetite: number,
  scope: "all" | "defaults",
): State {
  if (
    !Number.isInteger(people) ||
    people < 1 ||
    people > 12 ||
    !Number.isFinite(appetite) ||
    appetite < 0.75 ||
    appetite > 2.5
  )
    throw Error(
      "Enter 1–12 people and an appetite multiplier from 0.75× to 2.5×.",
    );
  return {
    ...state,
    settings: { ...state.settings, people, appetite },
    plan: state.plan.map((m) =>
      m.cooked || (scope === "defaults" && customised(state, m))
        ? customised(state, m) && !m.cooked
          ? { ...m, portionOverride: true }
          : m
        : { ...m, people, appetite, portionOverride: false },
    ),
  };
}
