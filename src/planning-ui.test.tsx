// @vitest-environment jsdom
import { useState } from "react";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanningPreferences } from "./components/PlanningPreferences";
import { RecipeControls } from "./components/RecipeControls";
import { MyMeals } from "./components/MyMeals";
import { defaults, type Recipe } from "./domain";
import { emptyV2, type State } from "./v2-state";
import { emptyV3 } from "./v3-state";
const recipe: Recipe = {
  id: "fixture-only",
  name: "Synthetic test meal",
  servings: 2,
  category: "Dinner",
  prep: 5,
  cook: 10,
  diet: [],
  appliances: ["Hob"],
  ingredients: [
    { name: "Rice", quantity: 200, unit: "g", department: "Pantry" },
  ],
  instructions: ["Test fixture only"],
  emoji: "",
  colour: "",
  origin: "household",
};
function fixture(): State {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "test",
      chain: "Coles",
      name: "Test fixture branch",
      postcode: "4000",
      suburb: "Test",
      address: "",
      origin: "user",
    },
  ];
  v3.primary = "test";
  return {
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: [recipe],
    plan: [],
    checked: [],
    pantry: [],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  };
}
afterEach(cleanup);
it("stages collapsible planning preferences, permits empty numeric edits and saves only on Generate", async () => {
  const user = userEvent.setup(),
    changed = vi.fn(),
    done = vi.fn();
  const s = fixture();
  render(
    <PlanningPreferences
      state={s}
      onChange={changed}
      onDone={done}
      onCancel={() => {}}
      onStores={() => {}}
    />,
  );
  expect(document.querySelectorAll(".planning-section")).toHaveLength(8);
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByText(/Number of people ·/));
  const input = screen.getByLabelText("Planning people");
  await user.clear(input);
  expect((input as HTMLInputElement).value).toBe("");
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(
    "Previous saved preferences are unchanged",
  );
  await user.type(input, "4");
  await user.click(screen.getByText(/Appetite multiplier ·/));
  const appetite = screen.getByLabelText("Planning appetite");
  await user.clear(appetite);
  await user.type(appetite, "1.5");
  await user.click(screen.getByText("Dietary requirements"));
  const allergens = screen.getByLabelText("Planning allergens");
  await user.type(allergens, "peanut, milk");
  expect((allergens as HTMLInputElement).value).toBe("peanut, milk");
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  const n = changed.mock.calls[0][0] as State;
  expect(n.settings).toEqual(s.settings);
  expect(n.plan.every((m) => m.people === 4 && m.appetite === 1.5)).toBe(true);
  expect(n.planning?.weeks[s.week].allergies).toEqual(["peanut", "milk"]);
  expect(done).toHaveBeenCalled();
});
it("requires explicit confirmation before replacing existing weekly meals", async () => {
  const user = userEvent.setup(),
    changed = vi.fn();
  const s = fixture();
  s.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: recipe.id,
      people: 2,
      appetite: 1,
      locked: false,
    },
  ];
  render(
    <PlanningPreferences
      state={s}
      onChange={changed}
      onDone={() => {}}
      onCancel={() => {}}
      onStores={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  expect(
    screen.getByRole("dialog", { name: "Confirm replacing weekly meals" }),
  ).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Keep existing plan" }));
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  await user.click(
    screen.getByRole("button", { name: "Replace unlocked meals & generate" }),
  );
  expect(changed).toHaveBeenCalledOnce();
});
it("heart toggles independently of repeat mode and weekday; changes immediately persist in parent state", async () => {
  const user = userEvent.setup();
  let latest = fixture();
  function Harness() {
    const [s, set] = useState(latest);
    return (
      <RecipeControls
        recipe={recipe}
        state={s}
        onChange={(n) => {
          latest = n;
          set(n);
        }}
      />
    );
  }
  render(<Harness />);
  await user.click(
    screen.getByRole("button", { name: "Favourite Synthetic test meal" }),
  );
  expect(latest.recipes[0].favourite).toBe(true);
  expect(latest.recipes[0].repeat).toBeUndefined();
  await user.click(
    screen.getByRole("button", {
      name: "Scheduling preferences for Synthetic test meal",
    }),
  );
  await user.selectOptions(
    screen.getByLabelText("Repeat Synthetic test meal"),
    "weekly-fixed",
  );
  await user.selectOptions(
    screen.getByLabelText("Weekday for Synthetic test meal"),
    "4",
  );
  await user.click(
    screen.getByRole("button", { name: "Unfavourite Synthetic test meal" }),
  );
  expect(latest.recipes[0].favourite).toBe(false);
  expect(latest.recipes[0].repeat).toEqual({ mode: "weekly-fixed", day: 4 });
  await user.selectOptions(
    screen.getByLabelText("Repeat Synthetic test meal"),
    "weekly-random",
  );
  expect(latest.recipes[0].repeat).toEqual({ mode: "weekly-random" });
});
it("offers actionable scheduling conflict controls without replacing the existing plan", async () => {
  const user = userEvent.setup();
  const s = fixture();
  s.recipes = [
    { ...recipe, repeat: { mode: "weekly-fixed", day: 0 } },
    {
      ...recipe,
      id: "fixture-two",
      name: "Second synthetic fixture",
      repeat: { mode: "weekly-fixed", day: 0 },
    },
  ];
  const changed = vi.fn();
  render(
    <PlanningPreferences
      state={s}
      onChange={changed}
      onDone={() => {}}
      onCancel={() => {}}
      onStores={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "both request this slot",
  );
  expect(changed).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", {
      name: "Scheduling preferences for Second synthetic fixture",
    }),
  ).toBeTruthy();
});
it("distinguishes planned from cooked and supports history correction, removal and favourites", async () => {
  const user = userEvent.setup();
  let latest = fixture();
  latest.recipes[0] = { ...recipe, favourite: true };
  latest.plan = [
    {
      day: 0,
      category: "Dinner",
      recipeId: recipe.id,
      people: 2,
      appetite: 1,
      locked: false,
    },
  ];
  function Harness() {
    const [s, set] = useState(latest);
    return (
      <MyMeals
        state={s}
        onChange={(n) => {
          latest = n;
          set(n);
        }}
        onOpen={() => {}}
      />
    );
  }
  render(<Harness />);
  expect(screen.getByText(/Planned · not confirmed cooked/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm cooked" }));
  const dialog = screen.getByRole("dialog", { name: "Edit meal history" });
  const date = within(dialog).getByLabelText("Actual cooking date");
  await user.clear(date);
  await user.type(date, "2026-10-20");
  await user.click(
    within(dialog).getByRole("button", { name: "Save cooking confirmation" }),
  );
  expect(latest.plan[0].cooked).toBe(true);
  expect(latest.planning?.history[0].date).toBe("2026-10-20");
  await user.click(
    screen.getByRole("button", { name: "Correct / remove history" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Remove cooking confirmation" }),
  );
  expect(latest.plan[0].cooked).toBe(false);
  await user.click(screen.getByRole("tab", { name: "Favourites" }));
  expect(
    screen.getByRole("tabpanel", { name: "Favourite recipes" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Unfavourite Synthetic test meal" }),
  );
  expect(
    screen.getByText("Tap a recipe’s heart to save a favourite."),
  ).toBeTruthy();
});
it("lets users resolve fixed-day conflicts by changing rotation and generating again", async () => {
  const user = userEvent.setup();
  let latest = fixture();
  latest.recipes = [
    { ...recipe, repeat: { mode: "weekly-fixed", day: 0 } },
    {
      ...recipe,
      id: "second-fixture",
      name: "Second fixture",
      repeat: { mode: "weekly-fixed", day: 0 },
    },
  ];
  const done = vi.fn();
  function Harness() {
    const [s, set] = useState(latest);
    return (
      <PlanningPreferences
        state={s}
        onChange={(n) => {
          latest = n;
          set(n);
        }}
        onDone={done}
        onCancel={() => {}}
        onStores={() => {}}
      />
    );
  }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  await user.click(
    screen.getByRole("button", {
      name: "Scheduling preferences for Second fixture",
    }),
  );
  await user.selectOptions(
    screen.getByLabelText("Repeat Second fixture"),
    "normal",
  );
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  expect(done).toHaveBeenCalled();
  expect(latest.plan).toHaveLength(7);
  expect(latest.plan[0].recipeId).toBe("fixture-only");
});
