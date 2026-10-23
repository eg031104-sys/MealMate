import { z } from "zod";
export const chains = ["Coles", "Woolworths", "ALDI", "IGA"] as const;
const nonnegative = z.number().finite().nonnegative();
export const storeSchema = z
  .object({
    id: z.string().min(1),
    chain: z.enum(chains),
    name: z.string().trim().min(1),
    suburb: z.string().trim(),
    postcode: z.string().regex(/^(\d{4})?$/),
    address: z.string(),
    origin: z.enum(["user", "authorised-directory", "openstreetmap"]),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    sourceUrl: z.string().url().optional(),
    retrievedAt: z.string().datetime().optional(),
    addressComplete: z.boolean().optional(),
    directoryProvider: z
      .enum(["photon", "vk-overpass", "private-coffee"])
      .optional(),
  })
  .superRefine((store, ctx) => {
    if (
      store.origin !== "openstreetmap" &&
      (!store.suburb || !/^\d{4}$/.test(store.postcode))
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter a suburb and four-digit postcode.",
      });
    if (
      store.origin === "openstreetmap" &&
      (store.latitude === undefined ||
        store.longitude === undefined ||
        !/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(
          store.sourceUrl ?? "",
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "Mapped stores require coordinates and their original source.",
      });
  });
export type Store = z.infer<typeof storeSchema>;
export const searchPlaceSchema = z.object({
  id: z.string(),
  label: z.string(),
  postcode: z.string(),
  latitude: z.number().finite().min(-44).max(-9),
  longitude: z.number().finite().min(112).max(155),
});
export type SearchPlace = z.infer<typeof searchPlaceSchema>;
export const storeFinderSchema = z.object({
  query: z.string().max(120),
  resultsQuery: z.string().max(120).default(""),
  location: searchPlaceSchema.nullable(),
  results: z.array(storeSchema).max(1000),
  fetchedAt: z.string().datetime().nullable(),
  radiusKm: z.union([z.literal(30), z.literal(50), z.literal(100)]),
});
export const emptyStoreFinder = () =>
  ({
    query: "",
    resultsQuery: "",
    location: null,
    results: [],
    fetchedAt: null,
    radiusKm: 30,
  }) as z.infer<typeof storeFinderSchema>;
export const storeProductSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  ingredientKey: z.string().min(1),
  name: z.string().min(1),
  unit: z.enum(["g", "ml", "each"]),
  size: z.number().finite().positive(),
  price: nonnegative.optional(),
  source: z.enum(["user", "estimate", "demo", "authorised"]),
  observedAt: z.string().datetime().optional(),
  verifiedUntil: z.string().datetime().optional(),
  provider: z.string().optional(),
  sourceUrl: z.string().optional(),
  availability: z.enum(["unknown", "available", "unavailable"]),
  availabilitySource: z.enum(["user", "authorised"]).optional(),
  availabilityAt: z.string().datetime().optional(),
  specialUntil: z.string().datetime().optional(),
  regularPrice: nonnegative.optional(),
});
export type StoreProduct = z.infer<typeof storeProductSchema>;
export const v3Schema = z
  .object({
    version: z.literal(3),
    stores: z.array(storeSchema).max(100),
    primary: z.string().nullable(),
    weekStores: z.record(z.string(), z.string()),
    comparisonStores: z.array(z.string()),
    products: z.array(storeProductSchema).max(20000),
    itemStores: z.record(z.string(), z.string()),
    independentMeals: z.array(
      z.object({
        id: z.string(),
        recipeId: z.string(),
        at: z.string(),
        people: z.number().positive(),
        appetite: z.number().min(0.75).max(2.5),
      }),
    ),
    storageDates: z.record(z.string(), z.string()),
    safeStorage: z.record(z.string(), z.boolean()).default({}),
    photoOffline: z.boolean(),
    storeFinder: storeFinderSchema.default(emptyStoreFinder),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.stores.map((s) => s.id));
    if (ids.size !== data.stores.length)
      ctx.addIssue({ code: "custom", message: "Duplicate saved store IDs" });
    const references = [
      data.primary,
      ...Object.values(data.weekStores),
      ...data.comparisonStores,
      ...Object.values(data.itemStores),
    ].filter((id): id is string => !!id);
    if (references.some((id) => !ids.has(id)))
      ctx.addIssue({
        code: "custom",
        message: "A saved store reference is missing",
      });
    if (
      data.products.some(
        (p) => !ids.has(p.storeId) || p.ingredientKey.split("|")[1] !== p.unit,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Product store or measurement unit does not match",
      });
    if (new Set(data.products.map((p) => p.id)).size !== data.products.length)
      ctx.addIssue({ code: "custom", message: "Duplicate store product IDs" });
  });
export type V3 = z.infer<typeof v3Schema>;
export function emptyV3(): V3 {
  return {
    version: 3,
    stores: [],
    primary: null,
    weekStores: {},
    comparisonStores: [],
    products: [],
    itemStores: {},
    independentMeals: [],
    storageDates: {},
    safeStorage: {},
    photoOffline: true,
    storeFinder: emptyStoreFinder(),
  };
}
