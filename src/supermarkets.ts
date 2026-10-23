import { rankProducts } from "./product-ranking";
import type { State } from "./v2-state";
import type { ShoppingItem, Meal, Recipe } from "./domain";
import { emptyV3, storeProductSchema } from "./v3-state";
import type { Store, StoreProduct } from "./v3-state";
export const supermarketData = (state: State) => state.v3 ?? emptyV3();
export function selectedStore(state: State): Store | undefined {
  const data = supermarketData(state);
  const id = data.weekStores[state.week] ?? data.primary;
  return data.stores.find((s) => s.id === id);
}
export function assignedStore(state: State, key: string) {
  const data = supermarketData(state);
  return (
    data.stores.find((s) => s.id === data.itemStores[`${state.week}/${key}`]) ??
    selectedStore(state)
  );
}
export const connectedAuthorisedProviders: ReadonlySet<string> = new Set();
export function priceStatus(
  p: StoreProduct,
  now = Date.now(),
  trusted: ReadonlySet<string> = connectedAuthorisedProviders,
): string {
  if (p.source === "community") return "Unknown price";
  if (p.price === undefined) return "Unknown price";
  if (p.source === "user") return "User-entered price";
  if (p.source === "estimate") return "Estimated price";
  if (p.source === "demo") return "Demonstration price";
  if (!trusted.has(p.provider ?? "")) return "Unverified imported price";
  const age = now - Date.parse(p.observedAt ?? "");
  if (!p.provider || !p.sourceUrl || !Number.isFinite(age) || age < 0)
    return "Unknown price";
  if (
    p.verifiedUntil &&
    Date.parse(p.verifiedUntil) > now &&
    age <= 24 * 3600000
  )
    return "Confirmed current price";
  if (age <= 7 * 86400000) return "Recently retrieved price";
  return "Stale retrieved price";
}
export function availabilityLabel(p?: StoreProduct, now = Date.now()) {
  if (!p || p.availability === "unknown") return "Availability unknown";
  if (
    !p.availabilityAt ||
    now - Date.parse(p.availabilityAt) > 24 * 3600000 ||
    now < Date.parse(p.availabilityAt)
  )
    return "Availability unknown — old observation";
  if (
    p.availabilitySource === "authorised" &&
    !connectedAuthorisedProviders.has(p.provider ?? "")
  )
    return "Availability unknown — provider not connected";
  return `${p.availabilitySource === "authorised" && p.provider ? "Verified" : "User-reported"} ${p.availability === "available" ? "available" : "unavailable"}`;
}
export function unavailable(p?: StoreProduct) {
  return (
    !!p &&
    p.availability === "unavailable" &&
    availabilityLabel(p).includes("unavailable")
  );
}
export function genuineSpecial(p: StoreProduct, now = Date.now()) {
  return (
    p.source === "authorised" &&
    priceStatus(p, now) === "Confirmed current price" &&
    p.specialUntil !== undefined &&
    Date.parse(p.specialUntil) > now &&
    p.price !== undefined &&
    p.regularPrice !== undefined &&
    p.price < p.regularPrice
  );
}
export function productsFor(
  state: State,
  i: ShoppingItem,
  storeId = assignedStore(state, i.key)?.id,
) {
  return supermarketData(state).products.filter(
    (p) =>
      p.storeId === storeId && p.ingredientKey === i.key && p.unit === i.unit,
  );
}
export function chooseStoreProduct(
  state: State,
  i: ShoppingItem,
  required = i.quantity,
  storeId = assignedStore(state, i.key)?.id,
) {
  const data = supermarketData(state);
  const choice = data.shopping?.selections[`${storeId}/${i.key}`];
  if (choice === null) return undefined;
  const candidates = productsFor(state, i, storeId);
  const chosen = candidates.find((p) => p.id === choice && !unavailable(p));
  if (chosen) return chosen;
  return rankProducts(
    candidates,
    i,
    required,
    data.shopping?.preference ?? "Balanced",
    choice,
    (p) =>
      ["Unknown price", "Unverified imported price"].includes(priceStatus(p))
        ? undefined
        : p.price,
    unavailable,
  )[0];
}
export function saveStoreProduct(state: State, raw: unknown): State {
  const product = storeProductSchema.parse(raw);
  const data = supermarketData(state);
  if (!data.stores.some((s) => s.id === product.storeId))
    throw Error("Choose a saved store first.");
  if (product.source === "authorised")
    throw Error(
      "Authorised prices can only be supplied by a configured trusted provider.",
    );
  return {
    ...state,
    v3: {
      ...data,
      products: data.products
        .filter((p) => p.id !== product.id)
        .concat(product),
    },
  };
}
export function findSavedStores(stores: Store[], query: string) {
  const q = query.trim().toLowerCase();
  return stores.filter((s) =>
    `${s.chain} ${s.name} ${s.suburb} ${s.postcode}`.toLowerCase().includes(q),
  );
}
export interface SupermarketProvider {
  id: string;
  label: string;
  licensed: boolean;
  stores(query: string): Promise<Store[]>;
  products(store: Store, keys: string[]): Promise<StoreProduct[]>;
}
// No retailer credentials or unofficial website endpoints are configured.
export const manualProvider: SupermarketProvider = {
  id: "manual-local",
  label: "Manual store catalogue — no live retailer feed",
  licensed: false,
  async stores() {
    return [];
  },
  async products() {
    return [];
  },
};
export function storeRequired(state: State) {
  return !!state.v3 && !selectedStore(state);
}

export function shoppingPreferences(state: State) {
  return (
    supermarketData(state).shopping ?? {
      preference: "Balanced" as const,
      selections: {},
      priceOverrides: {},
    }
  );
}
export function productSelectionKey(state: State, key: string) {
  return `${assignedStore(state, key)?.id}/${key}`;
}
export function selectProduct(
  state: State,
  key: string,
  id: string | null,
): State {
  const data = supermarketData(state),
    shopping = shoppingPreferences(state);
  if (
    id &&
    !data.products.some(
      (p) =>
        p.id === id &&
        p.ingredientKey === key &&
        p.storeId === assignedStore(state, key)?.id,
    )
  )
    throw Error("Product does not match this ingredient and store.");
  return {
    ...state,
    v3: {
      ...data,
      shopping: {
        ...shopping,
        selections: {
          ...shopping.selections,
          [productSelectionKey(state, key)]: id,
        },
      },
    },
  };
}
