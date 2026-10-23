import { z } from "zod";
import {
  createDirectoryClient,
  type DirectorySource,
} from "./directory-network";
import type { State } from "./v2-state";
import { storeSchema, type SearchPlace, type Store } from "./v3-state";
import { supermarketData } from "./supermarkets";

// Public, keyless services used only on an explicit Search/Refresh action.
// No Nominatim public endpoint, retailer scraping, location permission or stock API.
export const locationEndpoints = {
  photon: "https://photon.komoot.io/api/",
  overpass: "https://overpass.private.coffee/api/interpreter",
  vkOverpass: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  photonNearby: "https://photon.komoot.io/reverse",
};
export const LOCATION_CACHE_MS = 7 * 86400000;
export interface StoreLocationProvider {
  locations(query: string, signal?: AbortSignal): Promise<SearchPlace[]>;
  stores(
    place: SearchPlace,
    radiusKm: number,
    signal?: AbortSignal,
  ): Promise<Store[]>;
}
const point = z.object({ lat: z.number().finite(), lon: z.number().finite() });
const photonResponse = z.object({
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal("Point"),
        coordinates: z.array(z.number().finite()).min(2),
      }),
      properties: z.record(z.string(), z.unknown()),
    }),
  ),
});
const overpassResponse = z.object({
  remark: z.string().optional(),
  elements: z.array(
    z.object({
      type: z.enum(["node", "way", "relation"]),
      id: z.number().int().positive(),
      lat: z.number().finite().optional(),
      lon: z.number().finite().optional(),
      center: point.optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
});
export const inAustralia = (lat: number, lon: number) =>
  lat >= -44 && lat <= -9 && lon >= 112 && lon <= 155;
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const v =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, v)));
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export function parseLocations(raw: unknown, query: string): SearchPlace[] {
  const numeric = /^\d{4}$/.test(query.trim());
  const places = photonResponse.parse(raw).features.flatMap((feature) => {
    const p = feature.properties,
      [longitude, latitude] = feature.geometry.coordinates;
    if (
      text(p.countrycode).toUpperCase() !== "AU" ||
      !inAustralia(latitude, longitude)
    )
      return [];
    if (
      numeric &&
      text(p.postcode) !== query.trim() &&
      text(p.name) !== query.trim()
    )
      return [];
    // Do not silently pick a particular shop/house as the suburb centre.
    if (
      p.osm_key !== "place" &&
      p.osm_key !== "boundary" &&
      p.type !== "postcode"
    )
      return [];
    const label = [
      ...new Set(
        [
          text(p.name),
          text(p.city),
          text(p.district),
          text(p.state),
          text(p.postcode),
        ].filter(Boolean),
      ),
    ].join(", ");
    if (!label) return [];
    return [
      {
        id: `${text(p.osm_type)}/${p.osm_id}`,
        label,
        postcode: text(p.postcode),
        latitude,
        longitude,
      },
    ];
  });
  return places.filter(
    (p, i) =>
      places.findIndex(
        (other) => other.label === p.label && distanceKm(other, p) < 0.5,
      ) === i,
  );
}
export function chainFromTags(
  tags: Record<string, string>,
): Store["chain"] | undefined {
  // Prefer explicit brand/operator over a name which happens to mention a chain.
  for (const value of [tags.brand, tags.operator, tags.name]) {
    if (!value) continue;
    if (
      /\bcoles\b/i.test(value) &&
      !/express|liquor|local express|shell/i.test(value)
    )
      return "Coles";
    if (/\bwoolworths\b/i.test(value) && !/metrogo|petrol|caltex/i.test(value))
      return "Woolworths";
    if (/\baldi\b/i.test(value)) return "ALDI";
    if (/\biga\b/i.test(value)) return "IGA";
  }
}
export function parseStores(
  raw: unknown,
  origin: SearchPlace,
  radiusKm: number,
  now = new Date().toISOString(),
): Store[] {
  const response = overpassResponse.parse(raw);
  if (response.remark)
    throw Error(
      "The store directory returned an incomplete search. Please try again later.",
    );
  const stores = response.elements
    .flatMap((element) => {
      const tags = element.tags ?? {};
      if (
        !["supermarket", "convenience"].includes(tags.shop) ||
        tags.disused === "yes" ||
        tags.abandoned === "yes" ||
        tags.access === "private"
      )
        return [];
      const chain = chainFromTags(tags),
        latitude = element.lat ?? element.center?.lat,
        longitude = element.lon ?? element.center?.lon;
      const name = tags.name?.trim();
      if (
        !chain ||
        !name ||
        latitude === undefined ||
        longitude === undefined ||
        !inAustralia(latitude, longitude)
      )
        return [];
      if (distanceKm(origin, { latitude, longitude }) > radiusKm) return [];
      if (
        tags["addr:country"] &&
        !["AU", "Australia"].includes(tags["addr:country"])
      )
        return [];
      const street = tags["addr:street"];
      const address =
        tags["addr:full"] ||
        [
          street
            ? [tags["addr:housenumber"], street].filter(Boolean).join(" ")
            : "",
          tags["addr:unit"] ? `Unit ${tags["addr:unit"]}` : "",
          tags["addr:suburb"] || tags["addr:city"],
          tags["addr:state"],
          tags["addr:postcode"],
        ]
          .filter(Boolean)
          .join(", ");
      const store = storeSchema.parse({
        id: `osm/${element.type}/${element.id}`,
        chain,
        name,
        suburb: tags["addr:suburb"] || tags["addr:city"] || "",
        postcode: /^\d{4}$/.test(tags["addr:postcode"] ?? "")
          ? tags["addr:postcode"]
          : "",
        address,
        addressComplete: !!(tags["addr:full"] || tags["addr:street"]),
        origin: "openstreetmap",
        latitude,
        longitude,
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        retrievedAt: now,
      });
      return [store];
    })
    .sort(
      (a, b) =>
        distanceKm(origin, { latitude: a.latitude!, longitude: a.longitude! }) -
        distanceKm(origin, { latitude: b.latitude!, longitude: b.longitude! }),
    );
  // A mapped building and its POI often describe the same supermarket. Never
  // collapse separate branches merely because their chain/name is identical.
  return stores.filter(
    (s, i) =>
      !stores
        .slice(0, i)
        .some(
          (p) =>
            p.id === s.id ||
            (p.chain === s.chain &&
              p.name === s.name &&
              distanceKm(
                { latitude: p.latitude!, longitude: p.longitude! },
                { latitude: s.latitude!, longitude: s.longitude! },
              ) < 0.06),
        ),
  );
}
export function parsePhotonStores(
  raw: unknown,
  origin: SearchPlace,
  radiusKm: number,
): Store[] {
  const features = photonResponse.parse(raw).features;
  const elements = features.flatMap((feature) => {
    const p = feature.properties;
    const type = (
      { N: "node", W: "way", R: "relation" } as Record<string, string>
    )[text(p.osm_type).toUpperCase()];
    if (
      text(p.countrycode).toUpperCase() !== "AU" ||
      p.osm_key !== "shop" ||
      !["supermarket", "convenience"].includes(text(p.osm_value)) ||
      !type ||
      typeof p.osm_id !== "number" ||
      !Number.isInteger(p.osm_id) ||
      p.osm_id <= 0
    )
      return [];
    const [lon, lat] = feature.geometry.coordinates;
    return [
      {
        type,
        id: p.osm_id,
        lat,
        lon,
        tags: {
          shop: text(p.osm_value),
          name: text(p.name),
          "addr:housenumber": text(p.housenumber),
          "addr:street": text(p.street),
          "addr:suburb": text(p.district) || text(p.city),
          "addr:postcode": text(p.postcode),
          "addr:state": text(p.state),
        },
      },
    ];
  });
  return parseStores({ elements }, origin, radiusKm);
}
export function directoryAttempts(place: SearchPlace, radiusKm: number) {
  const params = new URLSearchParams({
    lat: String(place.latitude),
    lon: String(place.longitude),
    radius: String(radiusKm),
    limit: "100",
    lang: "en",
  });
  params.append("osm_tag", "shop:supermarket");
  params.append("osm_tag", "shop:convenience");
  const query = `[out:json][timeout:10];nwr(around:${radiusKm * 1000},${place.latitude},${place.longitude})[shop~"^(supermarket|convenience)$"][~"^(name|brand|operator)$"~"Coles|Woolworths|ALDI|IGA",i];out center tags;`;
  const post = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  };
  return [
    {
      id: "photon" as DirectorySource,
      label: "Photon nearby supermarkets (photon.komoot.io)",
      url: `${locationEndpoints.photonNearby}?${params}`,
    },
    {
      id: "vk-overpass" as DirectorySource,
      label: "VK Maps Overpass (maps.mail.ru)",
      url: locationEndpoints.vkOverpass,
      init: post,
    },
    {
      id: "private-coffee" as DirectorySource,
      label: "Private.coffee Overpass",
      url: locationEndpoints.overpass,
      init: post,
    },
  ];
}
const nearbyDirectories = createDirectoryClient();
let nextRequestAt = 0;
async function request(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const service = url.startsWith(locationEndpoints.photon)
    ? "Photon postcode/suburb lookup (photon.komoot.io)"
    : "Overpass store lookup (overpass.private.coffee)";
  if (Date.now() < nextRequestAt)
    throw Error("Please wait a few seconds before searching again.");
  nextRequestAt = Date.now() + 1200;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 40000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (response.status === 429 || response.status === 503) {
      nextRequestAt = Date.now() + 30000;
      throw Error(
        `${service}: service busy (HTTP ${response.status}). Please wait 30 seconds and try again. Your saved stores are unchanged.`,
      );
    }
    if (!response.ok)
      throw Error(
        `${service}: HTTP ${response.status}. Please try again later or use the manual fallback.`,
      );
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted)
      throw Error(
        `${service}: request timed out. Please try again later or use the manual fallback.`,
      );
    if (error instanceof TypeError)
      throw Error(
        `${service}: network or browser-access error. Check your internet connection. A provider outage or browser security/CORS block can also cause this; the browser does not reveal which. Retry later or use the manual fallback. Saved stores still work offline.`,
      );
    if (error instanceof SyntaxError)
      throw Error(
        `${service}: the service returned unreadable data. Please retry later or use the manual fallback.`,
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const osmStoreProvider: StoreLocationProvider = {
  async locations(query, signal) {
    const q = query.trim();
    if (
      q.length < 2 ||
      q.length > 120 ||
      (/^\d+$/.test(q) && !/^\d{4}$/.test(q))
    )
      throw Error("Enter an Australian suburb or a four-digit postcode.");
    const params = new URLSearchParams({
      q,
      countrycode: "AU",
      bbox: "112,-44,155,-9",
      limit: "10",
      lang: "en",
    });
    return parseLocations(
      await request(`${locationEndpoints.photon}?${params}`, {}, signal),
      q,
    );
  },
  async stores(place, radiusKm, signal) {
    if (
      !inAustralia(place.latitude, place.longitude) ||
      ![30, 50, 100].includes(radiusKm)
    )
      throw Error("Choose an Australian search location and supported radius.");
    const gap = Math.max(0, nextRequestAt - Date.now());
    if (gap) await new Promise<void>((resolve) => setTimeout(resolve, gap));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return nearbyDirectories.lookup(
      directoryAttempts(place, radiusKm),
      (raw, id) => {
        const stores =
          id === "photon"
            ? parsePhotonStores(raw, place, radiusKm)
            : parseStores(raw, place, radiusKm);
        return stores.map((store) => ({ ...store, directoryProvider: id }));
      },
      signal,
    );
  },
};
export function saveFoundStore(state: State, raw: Store): State {
  const data = supermarketData(state),
    store = storeSchema.parse(raw);
  const existing = data.stores.find(
    (s) =>
      s.id === store.id ||
      (s.chain === store.chain &&
        s.name.toLowerCase() === store.name.toLowerCase() &&
        s.address &&
        s.address.toLowerCase() === store.address.toLowerCase()),
  );
  const id = existing?.id ?? store.id;
  if (!existing && data.stores.length >= 100)
    throw Error("The saved-store limit is 100. Use an existing saved store.");
  return {
    ...state,
    v3: {
      ...data,
      stores: existing ? data.stores : [...data.stores, store],
      primary: id,
      weekStores: { ...data.weekStores, [state.week]: id },
    },
  };
}
