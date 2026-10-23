// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./main";
import { saveState, loadState } from "./storage";
import { defaults } from "./domain";
import { curatedRecipes } from "./curated-recipes";
import { emptyV2 } from "./v2-state";
import { emptyV3 } from "./v3-state";
afterEach(cleanup);
it("opens preferences before generating, saves weekly portions and keeps stores and household settings after reload", async () => {
  const user = userEvent.setup(),
    v3 = emptyV3();
  v3.stores = [
    {
      id: "fixture",
      chain: "IGA",
      name: "Fixture only store",
      address: "",
      suburb: "Test",
      postcode: "4000",
      origin: "user",
    },
  ];
  v3.primary = "fixture";
  const settings = { ...defaults, categories: ["Dinner" as const] };
  await saveState({
    settings,
    recipes: curatedRecipes,
    plan: [],
    checked: ["existing"],
    pantry: ["Salt"],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(screen.getAllByRole("button", { name: "Plan My Meals" })[0]);
  expect(
    screen.getByRole("region", { name: "Weekly planning preferences" }),
  ).toBeTruthy();
  expect((await loadState())?.plan).toEqual([]);
  await user.click(screen.getByText(/Number of people ·/));
  const people = screen.getByLabelText("Planning people");
  await user.clear(people);
  await user.type(people, "4");
  await user.click(screen.getByText(/Appetite multiplier ·/));
  const appetite = screen.getByLabelText("Planning appetite");
  await user.clear(appetite);
  await user.type(appetite, "1.5");
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  await screen.findByRole("heading", { name: /Your weekly menu/ });
  await waitFor(async () => expect((await loadState())?.plan).toHaveLength(7));
  const saved = (await loadState())!;
  expect(saved.settings).toEqual(settings);
  expect(saved.plan.every((m) => m.people === 4 && m.appetite === 1.5)).toBe(
    true,
  );
  expect(saved.v3?.primary).toBe("fixture");
  expect(saved.pantry).toEqual(["Salt"]);
  cleanup();
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  expect(
    (screen.getByLabelText("Planning store") as HTMLSelectElement).value,
  ).toBe("fixture");
  await user.click(screen.getAllByRole("button", { name: "Plan My Meals" })[0]);
  expect(
    (screen.getByLabelText("Planning people") as HTMLInputElement).value,
  ).toBe("4");
  expect(
    (screen.getByLabelText("Planning appetite") as HTMLInputElement).value,
  ).toBe("1.5");
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  expect(
    screen.getByRole("dialog", { name: "Confirm replacing weekly meals" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Keep existing plan" }));
  expect((await loadState())?.plan).toEqual(saved.plan);
}, 20000);
it("regenerates a stale saved Alfredo slot with weekly portions, then persists a manual override through swaps and reload", async () => {
  const user = userEvent.setup(),
    v3 = emptyV3();
  v3.stores = [
    {
      id: "portion-fixture",
      chain: "IGA",
      name: "Fixture store",
      address: "",
      suburb: "Test",
      postcode: "4000",
      origin: "user",
    },
  ];
  v3.primary = "portion-fixture";
  const r = curatedRecipes.find(
    (r) => r.id === "pdr-shrimp-fettuccine-alfredo",
  )!;
  const { savePlanningPreferences, preferencesFor } =
    await import("./weekly-planner");
  const s = {
    settings: {
      ...defaults,
      people: 2,
      appetite: 1,
      categories: ["Dinner" as const],
    },
    recipes: curatedRecipes.map((recipe) =>
      recipe.id === r.id
        ? { ...recipe, repeat: { mode: "weekly-fixed" as const, day: 0 } }
        : recipe,
    ),
    plan: [
      {
        day: 0,
        category: "Dinner" as const,
        recipeId: r.id,
        people: 2,
        appetite: 1,
        locked: false,
        portionOverride: true,
      },
    ],
    checked: ["preserved"],
    pantry: [],
    week: "2026-10-19",
    v2: emptyV2(),
    v3,
  };
  await saveState(
    savePlanningPreferences(s, {
      ...preferencesFor(s),
      people: 4,
      appetite: 1.25,
    }),
  );
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(screen.getAllByRole("button", { name: "Plan My Meals" })[0]);
  expect(
    (screen.getByLabelText("Planning people") as HTMLInputElement).value,
  ).toBe("4");
  await user.click(screen.getByRole("button", { name: "Generate My Meals" }));
  await user.click(
    screen.getByLabelText(/Use weekly portions for all unlocked/),
  );
  await user.click(
    screen.getByRole("button", { name: "Replace unlocked meals & generate" }),
  );
  await screen.findByRole("heading", { name: /Your weekly menu/ });
  expect(
    (screen.getByLabelText("Dinner people") as HTMLInputElement).value,
  ).toBe("4");
  expect(
    (screen.getByLabelText("Dinner appetite") as HTMLInputElement).value,
  ).toBe("1.25");
  await waitFor(async () => {
    const state = (await loadState())!;
    expect(
      state.plan.find((m) => m.day === 0 && m.category === "Dinner"),
    ).toMatchObject({
      recipeId: r.id,
      people: 4,
      appetite: 1.25,
      portionOverride: false,
    });
  });
  const people = screen.getByLabelText("Dinner people");
  await user.clear(people);
  await user.type(people, "6");
  await user.tab();
  await user.click(screen.getByRole("button", { name: "Swap" }));
  await waitFor(async () =>
    expect(
      (await loadState())!.plan.find(
        (m) => m.day === 0 && m.category === "Dinner",
      ),
    ).toMatchObject({ people: 6, appetite: 1.25, portionOverride: true }),
  );
  const saved = (await loadState())!;
  expect(saved.checked).toEqual(["preserved"]);
  cleanup();
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(screen.getByRole("button", { name: "Meal Planner" }));
  expect(
    (screen.getByLabelText("Dinner people") as HTMLInputElement).value,
  ).toBe("6");
  expect((await loadState())!.plan).toEqual(saved.plan);
}, 20000);
