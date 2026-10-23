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
