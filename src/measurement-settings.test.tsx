// @vitest-environment jsdom
import { useState } from "react";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeasurementSettings } from "./components/MeasurementSettings";
import { defaults } from "./domain";
import { emptyV2, type State } from "./v2-state";
import { curatedRecipes } from "./curated-recipes";
afterEach(cleanup);
it("allows empty drafts and applies ingredient estimates only after explicit save, retaining purchase records", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const initial: State = {
    settings: defaults,
    recipes: [
      {
        ...curatedRecipes[0],
        ingredients: [
          {
            name: "spinach",
            quantity: 60,
            unit: "g",
            department: "Fruit & veg",
            rawMeasure: "2 handfuls",
            approximate: true,
            estimateKey: "spinach|handful",
            estimateMultiplier: 2,
          },
        ],
      },
    ],
    plan: [],
    pantry: ["Salt"],
    checked: ["kept"],
    week: "2026-10-19",
    v2: emptyV2(),
  };
  function Harness() {
    const [s, set] = useState(initial);
    return (
      <>
        <MeasurementSettings
          state={s}
          onChange={(next) => {
            changed(next);
            set(next);
          }}
        />
        <output data-testid="quantity">
          {s.recipes[0].ingredients[0].quantity}
        </output>
      </>
    );
  }
  render(<Harness />);
  await user.type(
    screen.getByLabelText("Find a conversion"),
    "spinach|handful",
  );
  const input = screen.getByLabelText("spinach|handful");
  await user.clear(input);
  expect((input as HTMLInputElement).value).toBe("");
  expect(changed).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Save measurement estimates" }),
  );
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText(/Previous values are kept/).textContent).toContain(
    "Previous values are kept",
  );
  await user.type(input, "40");
  expect(screen.getByTestId("quantity").textContent).toBe("60");
  await user.click(
    screen.getByRole("button", { name: "Save measurement estimates" }),
  );
  expect(screen.getByTestId("quantity").textContent).toBe("80");
  const next = changed.mock.calls[0][0] as State;
  expect(next.v2).toBe(initial.v2);
  expect(next.checked).toEqual(["kept"]);
  expect(next.pantry).toEqual(["Salt"]);
});
