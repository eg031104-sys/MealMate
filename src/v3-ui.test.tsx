// @vitest-environment jsdom
import { useState } from "react";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumericInput } from "./components/NumericInput";
import { HouseholdServings } from "./components/HouseholdServings";
import { RecipePhoto } from "./components/RecipePhoto";
import { Supermarkets } from "./components/Supermarkets";
import { starterRecipes } from "./recipes";
import { defaults } from "./domain";
import type { State } from "./v2-state";
import { emptyV2 } from "./v2-state";
import { emptyV3 } from "./v3-state";
import { genuineRecipes } from "./genuine-recipes";
afterEach(cleanup);
it("allows clearing and replacing a number without restoring it on each keystroke", async () => {
  const user = userEvent.setup(),
    commit = vi.fn();
  render(
    <NumericInput
      aria-label="People"
      value={1}
      min={1}
      max={12}
      integer
      onCommit={commit}
    />,
  );
  const input = screen.getByLabelText("People");
  await user.clear(input);
  expect((input as HTMLInputElement).value).toBe("");
  expect(commit).not.toHaveBeenCalled();
  await user.type(input, "4");
  expect(commit).not.toHaveBeenCalled();
  await user.tab();
  expect(commit).toHaveBeenCalledWith(4);
});
it("keeps the last valid numeric value after an empty or negative submission", async () => {
  const user = userEvent.setup(),
    commit = vi.fn();
  render(
    <NumericInput aria-label="Budget" value={200} min={0} onCommit={commit} />,
  );
  const input = screen.getByLabelText("Budget");
  await user.clear(input);
  await user.tab();
  expect((input as HTMLInputElement).value).toBe("200");
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain(
    "Previous value kept",
  );
  await user.clear(input);
  await user.type(input, "-5");
  await user.keyboard("{Enter}");
  expect((input as HTMLInputElement).value).toBe("200");
  expect(commit).not.toHaveBeenCalled();
});
it("commits decimal quantities on Enter, not while typing", async () => {
  const user = userEvent.setup(),
    commit = vi.fn();
  render(
    <NumericInput aria-label="Quantity" value={1} min={0} onCommit={commit} />,
  );
  const input = screen.getByLabelText("Quantity");
  await user.clear(input);
  await user.type(input, "1.75");
  expect(commit).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(commit).toHaveBeenCalledWith(1.75);
});
const base = (): State => ({
  settings: { ...defaults, people: 1, categories: ["Dinner"] },
  recipes: starterRecipes,
  plan: [
    {
      day: 0,
      category: "Dinner",
      recipeId: "recipe-17",
      people: 1,
      appetite: 1,
      locked: true,
    },
    {
      day: 1,
      category: "Dinner",
      recipeId: "recipe-17",
      people: 3,
      appetite: 1,
      locked: false,
      portionOverride: true,
    },
  ],
  checked: [],
  pantry: [],
  week: "2026-10-19",
  v2: emptyV2(),
  v3: emptyV3(),
});
it("stages both household values and asks which customised meals to update", async () => {
  const user = userEvent.setup();
  let latest = base();
  function Harness() {
    const [state, setState] = useState(latest);
    return (
      <HouseholdServings
        state={state}
        onChange={(s) => {
          latest = s;
          setState(s);
        }}
      />
    );
  }
  render(<Harness />);
  const people = screen.getByLabelText("Default number of people"),
    appetite = screen.getByLabelText(/Default portion/);
  await user.clear(people);
  expect((people as HTMLInputElement).value).toBe("");
  await user.type(people, "4");
  await user.clear(appetite);
  await user.type(appetite, "1.5");
  expect(latest.settings.people).toBe(1);
  await user.click(
    screen.getByRole("button", { name: "Update all planned meals" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: /Apply only to meals using/ }),
  );
  expect(latest.settings.people).toBe(4);
  expect(latest.settings.appetite).toBe(1.5);
  expect(latest.plan[0].people).toBe(4);
  expect(latest.plan[0].locked).toBe(true);
  expect(latest.plan[1].people).toBe(3);
});
it("cancelling the serving confirmation does not save or change plans", async () => {
  const user = userEvent.setup(),
    change = vi.fn();
  render(<HouseholdServings state={base()} onChange={change} />);
  await user.clear(screen.getByLabelText("Default number of people"));
  await user.type(screen.getByLabelText("Default number of people"), "4");
  await user.click(
    screen.getByRole("button", { name: "Update all planned meals" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(change).not.toHaveBeenCalled();
});
it("renders an actual matching photograph and falls back gracefully on failure", () => {
  render(<RecipePhoto recipe={genuineRecipes.find((r) => !!r.photo)!} />);
  const img = screen.getByRole("img");
  expect(img.getAttribute("src")).toMatch(/^\/recipe-photos\//);
  expect(img.getAttribute("loading")).toBe("lazy");
  fireEvent.error(img);
  expect(screen.getByText("Photograph not available")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
it("uses a neutral placeholder when a recipe has no matching photo", () => {
  render(<RecipePhoto recipe={starterRecipes[0]} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("Photograph not available")).toBeTruthy();
});
it("can save a particular supermarket branch using manual directory fallback", async () => {
  const user = userEvent.setup();
  let latest = base();
  function Harness() {
    const [state, setState] = useState(latest);
    return (
      <Supermarkets
        state={state}
        onChange={(s) => {
          latest = s;
          setState(s);
        }}
      />
    );
  }
  render(<Harness />);
  await user.type(
    screen.getByLabelText("Store name / location"),
    "Example branch",
  );
  await user.type(screen.getByLabelText("Suburb"), "Example suburb");
  await user.type(screen.getByLabelText("Postcode"), "4000");
  await user.click(screen.getByRole("button", { name: "Save store" }));
  expect(latest.v3?.stores[0].name).toBe("Example branch");
  expect(latest.v3?.primary).toBe(latest.v3?.stores[0].id);
  expect(
    screen.getByText(/Live prices and stock are not connected/),
  ).toBeTruthy();
});
