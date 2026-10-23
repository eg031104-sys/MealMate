// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
afterEach(cleanup);
import { App } from "./main";
import { saveState, loadState } from "./storage";
import { defaults } from "./domain";
import { starterRecipes } from "./recipes";
import { emptyV2 } from "./v2-state";
it("supports independent daily switches, purchase recording and refresh persistence through the UI", async () => {
  const user = userEvent.setup();
  await saveState({
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: starterRecipes,
    plan: [
      {
        day: 0,
        category: "Dinner",
        recipeId: "recipe-17",
        people: 2,
        appetite: 1,
        locked: false,
      },
    ],
    checked: [],
    pantry: [],
    week: "2026-10-19",
    v2: emptyV2(),
  });
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(
    screen.getByRole("button", { name: /Wednesday 21 October/ }),
  );
  await user.click(screen.getByRole("switch", { name: "Lunch" }));
  expect(
    (screen.getByRole("switch", { name: "Lunch" }) as HTMLInputElement).checked,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: /Tuesday 20 October/ }));
  expect(
    (screen.getByRole("switch", { name: "Lunch" }) as HTMLInputElement).checked,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: /Shopping List/ }));
  await screen.findByRole("heading", { name: "A little list. All sorted." });
  await user.click(screen.getByRole("button", { name: /Chicken breast/ }));
  const qty = screen.getByLabelText("Actual quantity");
  await user.clear(qty);
  await user.type(qty, "500");
  const price = screen.getByLabelText("Total price paid (AUD, optional)");
  await user.type(price, "8");
  await user.click(screen.getByRole("button", { name: "Record purchase" }));
  await screen.findByText("✓ Recorded 500 g · $8.00");
  await waitFor(async () =>
    expect((await loadState())?.v2.purchases[0].quantity).toBe(500),
  );
  cleanup();
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(
    screen.getByRole("button", { name: /Wednesday 21 October/ }),
  );
  expect(
    (screen.getByRole("switch", { name: "Lunch" }) as HTMLInputElement).checked,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: /Shopping List/ }));
  await user.click(screen.getByRole("button", { name: /Chicken breast/ }));
  expect(screen.getByText("✓ Recorded 500 g · $8.00")).toBeTruthy();
  expect((await loadState())?.recipes.length).toBe(40);
  cleanup();
}, 20000);
it("renders appliance search, recipe filters and backup restore validation", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Your week, well fed." });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Your kitchen" });
  const appliance = screen.getByLabelText("Find an appliance");
  await user.type(appliance, "air");
  expect(screen.getByLabelText("Air fryer")).toBeTruthy();
  await user.click(screen.getByLabelText("Air fryer"));
  await waitFor(async () =>
    expect((await loadState())?.settings.appliances).toContain("Air fryer"),
  );
  await user.upload(
    screen.getByLabelText("Restore a backup"),
    new File(['{"bad":true}'], "broken.json", { type: "application/json" }),
  );
  await screen.findByText(/Backup rejected:/);
  await user.click(screen.getByRole("button", { name: "Recipes" }));
  await screen.findByLabelText("Search recipes");
  await user.click(screen.getByLabelText(/Show archived recipes/));
  await user.type(
    screen.getByLabelText("Search recipes"),
    "chickpea spinach curry",
  );
  expect(
    screen.getByRole("heading", { name: "Chickpea spinach curry" }),
  ).toBeTruthy();
  expect(screen.getByText("☆ Favourite")).toBeTruthy();
  cleanup();
}, 20000);
