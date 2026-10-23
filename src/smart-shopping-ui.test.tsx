// @vitest-environment jsdom
import { useState } from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProductPhoto,
  ProductSuggestion,
  ShoppingPreference,
} from "./components/ProductSuggestion";
import { RecipeControls } from "./components/RecipeControls";
import {
  shoppingFixture,
  ingredient,
  testProduct,
} from "./shopping-test-fixture";
import { saveStoreProduct } from "./supermarkets";
import { budget } from "./shopping";
import { readFileSync } from "node:fs";
afterEach(cleanup);
it.each([320, 360, 390, 430])(
  "opens scheduling outside card width at %i px and supports close, fixed weekdays and Escape",
  async (width) => {
    Object.defineProperty(window, "innerWidth", {
      value: width,
      configurable: true,
    });
    const user = userEvent.setup();
    const s = shoppingFixture();
    function Harness() {
      const [state, setState] = useState(s);
      return (
        <div style={{ width: 100 }} data-testid="narrow-card">
          <RecipeControls
            recipe={state.recipes[0]}
            state={state}
            onChange={setState}
          />
        </div>
      );
    }
    render(<Harness />);
    await user.click(screen.getByLabelText(/Scheduling preferences/));
    const panel = screen.getByRole("dialog");
    expect(panel.parentElement?.parentElement).toBe(document.body);
    expect(screen.queryByLabelText(/Weekday for/)).toBeNull();
    await user.selectOptions(
      screen.getByLabelText(/Repeat Test/),
      "weekly-fixed",
    );
    expect(screen.getByLabelText(/Weekday for/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/Repeat Test/), "normal");
    expect(screen.queryByLabelText(/Weekday for/)).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByLabelText(/Scheduling preferences/),
    );
  },
);
it("has viewport-based sheet CSS at 320–430 px rather than a shrink-to-fit arrow panel", () => {
  // jsdom cannot measure layout; assert the portalled sheet's actual CSS rules.
  const css = readFileSync("src/planning.css", "utf8");
  expect(css).toMatch(/\.schedule-backdrop\s*\{[^}]*position: fixed/);
  expect(css).toMatch(
    /@media \(max-width: 600px\)[\s\S]*\.schedule-backdrop \.repeat-panel\s*\{\s*width: 100%;\s*max-width: none/,
  );
});
it("product thumbnails are lazy and fall back on missing or failed images", () => {
  const p = {
    ...testProduct(),
    image: "https://images.openfoodfacts.org/test.jpg",
    imageLicense: "CC BY-SA 3.0",
  };
  const view = render(<ProductPhoto product={p} />);
  expect(screen.getByRole("img").getAttribute("loading")).toBe("lazy");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByLabelText("Product photo unavailable")).toBeTruthy();
  view.unmount();
  render(<ProductPhoto product={testProduct()} />);
  expect(screen.getByLabelText("Product photo unavailable")).toBeTruthy();
});
it("changes products, falls back to generic, saves price overrides and persists shopping preference", async () => {
  const user = userEvent.setup();
  let latest = saveStoreProduct(
    shoppingFixture(),
    testProduct("small", 200, 3),
  );
  latest = saveStoreProduct(latest, testProduct("big", 500, 5));
  function Harness() {
    const [state, setState] = useState(latest);
    return (
      <>
        <ShoppingPreference
          state={state}
          onChange={(s) => {
            latest = s;
            setState(s);
          }}
        />
        <ProductSuggestion
          state={state}
          item={ingredient}
          onChange={(s) => {
            latest = s;
            setState(s);
          }}
        />
      </>
    );
  }
  render(<Harness />);
  await user.selectOptions(
    screen.getByLabelText("Shopping preference"),
    "Premium",
  );
  expect(latest.v3!.shopping!.preference).toBe("Premium");
  await user.click(
    screen.getByRole("button", { name: "Change suggested product" }),
  );
  await user.click(
    screen.getAllByRole("button", { name: "Choose this product" })[1],
  );
  expect(budget(latest).total).toBe(5);
  await user.click(screen.getByText("Price override"));
  await user.type(screen.getByLabelText(/Your price per/), "4.5");
  await user.click(screen.getByRole("button", { name: "Save price override" }));
  expect(budget(latest).total).toBe(4.5);
  await user.click(
    screen.getByRole("button", { name: "Change suggested product" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Use generic ingredient" }),
  );
  expect(screen.getByText("Generic ingredient")).toBeTruthy();
  expect(
    latest.v3!.shopping!.selections["test-store/tomato paste|g"],
  ).toBeNull();
});
