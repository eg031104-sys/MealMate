// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreFinder } from "./components/StoreFinder";
import { StoreSelector } from "./components/Supermarkets";
import { defaults } from "./domain";
import { emptyV2, migrateState, type State } from "./v2-state";
import { emptyV3, type Store, type SearchPlace } from "./v3-state";
import type { StoreLocationProvider } from "./store-finder";
const place: SearchPlace = {
  id: "fixture",
  label: "Test suburb, Queensland, 4272",
  postcode: "4272",
  latitude: -27.93,
  longitude: 153.19,
};
const store = (id: number, chain: Store["chain"]): Store => ({
  id: `osm/node/${id}`,
  name: `${chain} fixture branch`,
  chain,
  suburb: "Test suburb",
  postcode: "4272",
  address: "1 Fixture Street, Test suburb QLD 4272",
  addressComplete: true,
  origin: "openstreetmap",
  latitude: -27.94,
  longitude: 153.19,
  sourceUrl: `https://www.openstreetmap.org/node/${id}`,
});
const provider = (): StoreLocationProvider => ({
  locations: vi.fn().mockResolvedValue([place]),
  stores: vi.fn().mockResolvedValue([store(1, "Coles"), store(2, "ALDI")]),
});
const base = (): State => ({
  settings: defaults,
  recipes: [],
  plan: [],
  checked: [],
  pantry: [],
  week: "2026-10-19",
  v2: emptyV2(),
  v3: emptyV3(),
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("opens a working finder when the dashboard selector has no saved stores", () => {
  render(<StoreSelector state={base()} onChange={vi.fn()} compact />);
  expect(screen.getByLabelText("Australian postcode or suburb")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Search nearby stores" }),
  ).toBeTruthy();
});
it("finds, filters, saves and immediately populates the dashboard selector", async () => {
  const user = userEvent.setup(),
    source = provider();
  let latest = base();
  function Harness() {
    const [state, set] = useState(latest);
    return (
      <>
        <StoreSelector state={state} onChange={set} />
        <StoreFinder
          state={state}
          onChange={(s) => {
            latest = s;
            set(s);
          }}
          provider={source}
        />
      </>
    );
  }
  // Hide the selector's initial finder so this test exercises just the injected provider.
  latest.v3!.stores = [store(9, "IGA")];
  latest.v3!.primary = "osm/node/9";
  render(<Harness />);
  await user.type(
    screen.getByLabelText("Australian postcode or suburb"),
    "4272",
  );
  await user.click(
    screen.getByRole("button", { name: "Search nearby stores" }),
  );
  const found = await screen.findByRole("button", {
    name: /Coles fixture branch.*Save & select/s,
  });
  expect(source.locations).toHaveBeenCalledWith(
    "4272",
    expect.any(AbortSignal),
  );
  await user.selectOptions(
    screen.getByLabelText("Filter supermarket chain"),
    "ALDI",
  );
  expect(
    screen.queryByRole("button", {
      name: /Coles fixture branch.*Save & select/s,
    }),
  ).toBeNull();
  await user.selectOptions(
    screen.getByLabelText("Filter supermarket chain"),
    "All chains",
  );
  await user.click(
    screen.getByRole("button", {
      name: /Coles fixture branch.*Save & select/s,
    }),
  );
  expect(latest.v3!.primary).toBe("osm/node/1");
  expect(
    (
      screen.getByRole("combobox", {
        name: "Planning store",
      }) as HTMLSelectElement
    ).value,
  ).toBe("osm/node/1");
  expect(
    screen.getByRole("option", { name: /Coles — Coles fixture branch/ }),
  ).toBeTruthy();
  expect(found.textContent).toContain("1.1 km");
});
it("shows loading, no results and missing-address states without fabricated details", async () => {
  const source = provider();
  let finish!: (stores: Store[]) => void;
  source.stores = vi.fn(
    () =>
      new Promise<Store[]>((resolve) => {
        finish = resolve;
      }),
  );
  function Harness() {
    const [state, set] = useState(base());
    return <StoreFinder state={state} onChange={set} provider={source} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "4272" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await screen.findByText("Finding nearby supermarkets…");
  expect(
    (
      screen.getByRole("button", {
        name: "Search nearby stores",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  finish([]);
  await screen.findByText(/No mapped stores found/);
  source.stores = vi.fn().mockResolvedValue([
    {
      ...store(1, "Coles"),
      address: "",
      postcode: "",
      suburb: "",
      addressComplete: false,
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
  await screen.findByText("Address not supplied by OpenStreetMap");
});
it("offers choices for ambiguous suburbs and waits for a selected centre", async () => {
  const source = provider();
  source.locations = vi
    .fn()
    .mockResolvedValue([
      place,
      { ...place, id: "other", label: "Other test locality" },
    ]);
  render(<StoreFinder state={base()} onChange={vi.fn()} provider={source} />);
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "Test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await screen.findByRole("button", { name: "Other test locality" });
  expect(source.stores).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: place.label }));
  await waitFor(() =>
    expect(source.stores).toHaveBeenCalledWith(
      place,
      30,
      expect.any(AbortSignal),
    ),
  );
});
it("preserves cached search and saved data on network error, and does not reuse results for a failed new query", async () => {
  const state = base(),
    source = provider();
  source.locations = vi.fn().mockRejectedValue(Error("Directory unreachable"));
  state.v3!.storeFinder = {
    query: "4272",
    resultsQuery: "4272",
    location: place,
    results: [store(1, "Coles")],
    fetchedAt: new Date().toISOString(),
    radiusKm: 30,
  };
  let latest = state;
  function Harness() {
    const [s, set] = useState(state);
    return (
      <StoreFinder
        state={s}
        onChange={(n) => {
          latest = n;
          set(n);
        }}
        provider={source}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "Sydney NSW" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Directory unreachable",
  );
  expect(latest.v3!.storeFinder.query).toBe("Sydney NSW");
  expect(latest.v3!.storeFinder.resultsQuery).toBe("4272");
  expect(latest.v3!.storeFinder.results).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await waitFor(() => expect(source.locations).toHaveBeenCalledTimes(2));
});
it("reopens a saved postcode and cached results offline without calling providers", async () => {
  const source = provider(),
    s = base();
  s.v3!.storeFinder = {
    query: "4272",
    resultsQuery: "4272",
    location: place,
    results: [store(1, "Coles")],
    fetchedAt: new Date().toISOString(),
    radiusKm: 30,
  };
  render(
    <StoreFinder
      state={migrateState(s)}
      onChange={vi.fn()}
      provider={source}
    />,
  );
  expect(
    (screen.getByLabelText("Australian postcode or suburb") as HTMLInputElement)
      .value,
  ).toBe("4272");
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await screen.findByText(/Showing your saved search/);
  expect(source.locations).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", {
      name: /Coles fixture branch.*Save & select/s,
    }),
  ).toBeTruthy();
});
it("ignores a response after cancelling a search", async () => {
  let finish!: (stores: Store[]) => void;
  const source = provider();
  source.stores = vi.fn(
    () =>
      new Promise<Store[]>((resolve) => {
        finish = resolve;
      }),
  );
  const change = vi.fn();
  render(<StoreFinder state={base()} onChange={change} provider={source} />);
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "4272" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await screen.findByText("Finding nearby supermarkets…");
  fireEvent.click(screen.getByRole("button", { name: "Cancel search" }));
  finish([store(1, "Coles")]);
  await screen.findByText(/Search cancelled/);
  expect(change).toHaveBeenCalledTimes(1); // only persist the query, not the cancelled result
});
it("validates invalid postcodes locally and reports an unmatched locality clearly", async () => {
  const source = provider();
  source.locations = vi.fn().mockResolvedValue([]);
  render(<StoreFinder state={base()} onChange={vi.fn()} provider={source} />);
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "427" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "four-digit postcode",
  );
  expect(source.locations).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Australian postcode or suburb"), {
    target: { value: "Unknown test locality" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search nearby stores" }));
  await screen.findByText(/No matching Australian suburb or postcode/);
  expect(source.stores).not.toHaveBeenCalled();
});
it("labels capped Photon results instead of claiming a complete supermarket directory", () => {
  const s = base();
  s.v3!.storeFinder = {
    query: "4272",
    resultsQuery: "4272",
    location: place,
    results: [{ ...store(1, "Coles"), directoryProvider: "photon" }],
    fetchedAt: new Date().toISOString(),
    radiusKm: 30,
  };
  render(<StoreFinder state={s} onChange={vi.fn()} provider={provider()} />);
  expect(
    screen.getByText(/results may be capped; not a complete store directory/),
  ).toBeTruthy();
});
