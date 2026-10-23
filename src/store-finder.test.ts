import { afterEach, describe, expect, it, vi } from "vitest";
import { defaults } from "./domain";
import {
  emptyV2,
  exportBackup,
  migrateState,
  parseBackup,
  type State,
} from "./v2-state";
import { emptyV3, storeSchema, type SearchPlace } from "./v3-state";
import {
  distanceKm,
  chainFromTags,
  parseLocations,
  parseStores,
  saveFoundStore,
  osmStoreProvider,
} from "./store-finder";
import { selectedStore } from "./supermarkets";
const centre: SearchPlace = {
  id: "test-centre",
  label: "Synthetic test centre, QLD",
  postcode: "4272",
  latitude: -27.93,
  longitude: 153.19,
};
// Synthetic fixtures are deliberately not bundled search results or real stores.
const element = (
  id: number,
  name = "Coles Test fixture",
  lat = -27.94,
  extra = {},
) => ({
  type: "node",
  id,
  lat,
  lon: 153.19,
  tags: {
    shop: "supermarket",
    name,
    "addr:housenumber": "1",
    "addr:street": "Fixture Street",
    "addr:suburb": "Test suburb",
    "addr:postcode": "4272",
    ...extra,
  },
});
const response = (...elements: unknown[]) => ({ elements });
const rawPlace = (extra = {}, coordinates = [153.19, -27.93]) => ({
  geometry: { type: "Point", coordinates },
  properties: {
    osm_key: "place",
    osm_type: "N",
    osm_id: 123,
    countrycode: "AU",
    name: "Test locality",
    state: "Queensland",
    postcode: "4272",
    ...extra,
  },
});
function fixture(): State {
  return {
    settings: defaults,
    recipes: [],
    plan: [],
    checked: [],
    pantry: [],
    week: "2026-10-19",
    v2: emptyV2(),
    v3: emptyV3(),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("real-source response validation", () => {
  it("keeps Australian postcode matches and rejects wrong countries, wrong postcodes and shops as centres", () => {
    expect(
      parseLocations(
        {
          features: [
            rawPlace(),
            rawPlace({ countrycode: "AT" }),
            rawPlace({ postcode: "4000" }),
            rawPlace({ osm_key: "shop" }),
            rawPlace({}, [0, 0]),
          ],
        },
        "4272",
      ),
    ).toHaveLength(1);
  });
  it("accepts named suburbs without assuming a postcode and deduplicates locations", () => {
    const places = parseLocations(
      {
        features: [
          rawPlace({ postcode: undefined }),
          rawPlace({ postcode: undefined }),
        ],
      },
      "Test locality QLD",
    );
    expect(places).toHaveLength(1);
    expect(places[0].postcode).toBe("");
  });
  it("recognises the four chains and excludes fuel and unrelated shops", () => {
    for (const chain of ["Coles", "Woolworths", "ALDI", "IGA"])
      expect(chainFromTags({ brand: chain })).toBe(chain);
    expect(chainFromTags({ name: "Coles Express" })).toBeUndefined();
    expect(chainFromTags({ name: "Unrelated food shop" })).toBeUndefined();
  });
  it("sorts by measured straight-line distance and only returns nearby supported stores", () => {
    const stores = parseStores(
      response(
        element(1, "Coles Distant fixture", -28.03),
        element(2, "IGA Closest fixture", -27.931),
        element(3, "ALDI Outside fixture", -30),
        element(4, "Unrelated fixture"),
        element(5, "Coles Fixture fuel", -27.93, { shop: "fuel" }),
      ),
      centre,
      30,
    );
    expect(stores.map((s) => s.id)).toEqual(["osm/node/2", "osm/node/1"]);
    expect(stores[0].address).toBe("1 Fixture Street, Test suburb, 4272");
    expect(stores[0].sourceUrl).toBe("https://www.openstreetmap.org/node/2");
    expect(distanceKm(centre, centre)).toBe(0);
    expect(
      distanceKm(centre, { latitude: -28.93, longitude: 153.19 }),
    ).toBeCloseTo(111.195, 2);
  });
  it("uses building centres and leaves absent address/postcode unknown, never copies the searched postcode", () => {
    const stores = parseStores(
      response({
        type: "way",
        id: 12,
        center: { lat: -27.94, lon: 153.19 },
        tags: { shop: "supermarket", name: "Woolworths fixture" },
      }),
      centre,
      30,
    );
    expect(stores[0]).toMatchObject({
      address: "",
      suburb: "",
      postcode: "",
      addressComplete: false,
      origin: "openstreetmap",
    });
    expect(storeSchema.safeParse(stores[0]).success).toBe(true);
    expect(
      storeSchema.safeParse({ ...stores[0], origin: "user" }).success,
    ).toBe(false);
  });
  it("deduplicates building/POI records while preserving distinct branches", () => {
    const stores = parseStores(
      response(
        element(1),
        element(2, "Coles Test fixture", -27.94001),
        element(3, "Coles Test fixture", -27.95),
      ),
      centre,
      30,
    );
    expect(stores).toHaveLength(2);
  });
  it("rejects partial Overpass results and malformed responses instead of reporting no stores", () => {
    expect(() =>
      parseStores({ elements: [], remark: "runtime timeout" }, centre, 30),
    ).toThrow(/incomplete/);
    expect(() => parseStores({ error: "busy" }, centre, 30)).toThrow();
    expect(() => parseLocations({ features: null }, "4272")).toThrow();
  });
});
describe("store selection and persistence", () => {
  it("saves a found store and updates primary/current week without changing other weeks or household records", () => {
    const s = fixture(),
      stores = parseStores(
        response(element(1), element(2, "IGA fixture")),
        centre,
        30,
      );
    const first = saveFoundStore(s, stores[0]);
    first.v3!.weekStores["2026-10-12"] = stores[0].id;
    const second = saveFoundStore(first, stores[1]);
    expect(selectedStore(second)?.id).toBe(stores[1].id);
    expect(second.v3!.weekStores["2026-10-12"]).toBe(stores[0].id);
    expect(second.v2).toBe(s.v2);
    expect(second.plan).toBe(s.plan);
    expect(second.settings).toBe(s.settings);
    expect(saveFoundStore(second, stores[1]).v3!.stores).toHaveLength(2);
  });
  it("adds safe defaults to an existing V3 snapshot and includes search and selected stores in backup", () => {
    const s = fixture();
    delete (s.v3 as unknown as Record<string, unknown>).storeFinder;
    const migrated = migrateState(s);
    expect(migrated.v3!.storeFinder.query).toBe("");
    const store = parseStores(response(element(1)), centre, 30)[0];
    const saved = saveFoundStore(migrated, store);
    saved.v3!.storeFinder = {
      query: "4272",
      resultsQuery: "4272",
      location: centre,
      results: [store],
      fetchedAt: new Date().toISOString(),
      radiusKm: 30,
    };
    const restored = parseBackup(exportBackup(saved));
    expect(restored.v3).toEqual(saved.v3);
  });
});
describe("network requests", () => {
  it("uses Australian geocoding and keyless public store search without permission requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [rawPlace()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => response(element(1)),
      });
    vi.stubGlobal("fetch", fetcher);
    const places = await osmStoreProvider.locations("4272");
    expect(String(fetcher.mock.calls[0][0])).toContain("countrycode=AU");
    const result = osmStoreProvider.stores(places[0], 30);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toHaveLength(1);
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://overpass.private.coffee/api/interpreter",
    );
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(String(fetcher.mock.calls[1][1].body)).toContain("around");
    expect(fetcher.mock.calls[1][1].credentials).toBe("omit");
  });
  it("reports rate limiting and network failure clearly rather than returning invented records", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2028-01-01").getTime());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 429, ok: false }),
    );
    await expect(osmStoreProvider.locations("4272")).rejects.toThrow(
      /30 seconds/,
    );
    vi.spyOn(Date, "now").mockReturnValue(new Date("2028-01-02").getTime());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(osmStoreProvider.locations("4272")).rejects.toThrow(
      /internet connection/,
    );
  });
});
it("identifies the failing provider and explains that CORS cannot be distinguished from other connection failures", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date("2030-01-01").getTime());
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(osmStoreProvider.locations("4272")).rejects.toThrow(
    /Photon.*network or browser-access error.*CORS.*does not reveal which/,
  );
  vi.spyOn(Date, "now").mockReturnValue(new Date("2030-01-02").getTime());
  await expect(osmStoreProvider.stores(centre, 30)).rejects.toThrow(
    /Overpass store lookup.*network or browser-access error/,
  );
});
it("identifies provider HTTP and invalid-JSON errors without displaying an empty store list", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date("2031-01-01").getTime());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(osmStoreProvider.locations("4272")).rejects.toThrow(
    /Photon.*HTTP 403/,
  );
  vi.spyOn(Date, "now").mockReturnValue(new Date("2031-01-02").getTime());
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }),
  );
  await expect(osmStoreProvider.locations("4272")).rejects.toThrow(
    /Photon.*unreadable data/,
  );
});
