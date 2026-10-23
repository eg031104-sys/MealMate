import { z } from "zod";
import type { ShoppingItem } from "./domain";
import type { Store, StoreProduct } from "./v3-state";
const record = z.object({
  code: z.string().regex(/^\d{8,14}$/),
  product_name: z.string().min(1),
  brands: z.string().optional(),
  quantity: z.string(),
  stores_tags: z.array(z.string()),
  countries_tags: z.array(z.string()),
  image_front_small_url: z.string().optional(),
  last_modified_t: z.number().optional(),
});
export function parsePack(
  text: string,
): { size: number; unit: "g" | "ml" | "each" } | undefined {
  const match = text
    .trim()
    .toLowerCase()
    .match(/^(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|ml|l|each|eggs?)$/);
  if (!match) return;
  const size =
    Number(match[1] ?? 1) *
    Number(match[2]) *
    (["kg", "l"].includes(match[3]) ? 1000 : 1);
  if (!(size > 0) || !Number.isFinite(size)) return;
  return {
    size,
    unit: ["kg", "g"].includes(match[3])
      ? "g"
      : ["ml", "l"].includes(match[3])
        ? "ml"
        : "each",
  };
}
const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function productImageUrl(value?: string) {
  try {
    const u = new URL(value ?? "");
    return u.protocol === "https:" && u.hostname === "images.openfoodfacts.org"
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function parseCommunityProducts(
  raw: unknown,
  store: Store,
  item: ShoppingItem,
  now = new Date().toISOString(),
): StoreProduct[] {
  const payload = z
    .object({ products: z.array(z.unknown()).max(100) })
    .safeParse(raw);
  if (!payload.success || item.prepared) return [];
  const keyWords = normal(item.name)
    .replace(/\b(tinned|canned|fresh)\b/g, "")
    .trim()
    .split(/\s+/);
  const results: StoreProduct[] = [];
  for (const value of payload.data.products) {
    const parsed = record.safeParse(value);
    if (!parsed.success) continue;
    const p = parsed.data,
      pack = parsePack(p.quantity),
      title = normal(p.product_name);
    if (
      !pack ||
      pack.unit !== item.unit ||
      !p.countries_tags.includes("en:australia") ||
      !p.stores_tags.some(
        (s) =>
          s.replace(/^en:/, "").toLowerCase() === store.chain.toLowerCase(),
      )
    )
      continue;
    // Conservative phrase matching: reject finished foods that merely contain
    // the ingredient (milk chocolate, rice crackers, pasta sauce, etc.).
    const dishWords =
      title.match(
        /\b(chocolate|biscuits?|snacks?|ready meal|flavoured|crackers?|cakes?|soup|sauce|curry|pizza|flour|powder|marinated|seasoned)\b/g,
      ) ?? [];
    if (
      !keyWords.length ||
      !new RegExp("\\b" + keyWords.join(" ") + "\\b").test(title) ||
      dishWords.some((word) => !keyWords.includes(word))
    )
      continue;
    results.push({
      id: `off/${store.id}/${item.key}/${p.code}`,
      storeId: store.id,
      ingredientKey: item.key,
      name: p.product_name,
      brand: p.brands,
      barcode: p.code,
      unit: pack.unit,
      size: pack.size,
      packageLabel: p.quantity,
      source: "community",
      provider: "open-food-facts",
      sourceUrl: `https://world.openfoodfacts.org/product/${p.code}`,
      image: productImageUrl(p.image_front_small_url),
      imageLicense: "CC BY-SA 3.0 — Open Food Facts contributors",
      scope: "chain-community",
      availability: "unknown",
      retrievedAt: now,
      observedAt:
        p.last_modified_t &&
        Number.isFinite(p.last_modified_t) &&
        p.last_modified_t > 0 &&
        p.last_modified_t < 253402300799
          ? new Date(p.last_modified_t * 1000).toISOString()
          : undefined,
      suitability: 1,
    });
  }
  return [...new Map(results.map((p) => [p.id, p])).values()];
}
export interface ProductDataAdapter {
  id: string;
  search(store: Store, item: ShoppingItem): Promise<StoreProduct[]>;
}
const cache = new Map<string, { at: number; products: StoreProduct[] }>();
let nextRequest = 0,
  blockedUntil = 0;
export const communityProducts: ProductDataAdapter = {
  id: "open-food-facts",
  async search(store, item) {
    const key = `${store.chain}/${item.key}`,
      now = Date.now();
    // Cache is store-scoped because product IDs include the selected store.
    const cacheKey = `${store.id}/${key}`,
      hit = cache.get(cacheKey);
    if (hit && now - hit.at < 86400000) return hit.products;
    if (now < blockedUntil)
      throw Error(
        "Open Food Facts is cooling down after a failed request. Use generic estimates or your own product details; try again in five minutes.",
      );
    if (now < nextRequest)
      throw Error("Please wait at least 7 seconds between product searches.");
    nextRequest = now + 7000;
    const query = new URLSearchParams({
      action: "process",
      json: "1",
      search_simple: "1",
      tagtype_0: "countries",
      tag_contains_0: "contains",
      tag_0: "australia",
      tagtype_1: "stores",
      tag_contains_1: "contains",
      tag_1: store.chain.toLowerCase(),
      search_terms: item.name,
      page_size: "20",
      fields:
        "code,product_name,brands,quantity,stores_tags,countries_tags,image_front_small_url,last_modified_t",
    });
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?${query}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const products = parseCommunityProducts(
        await response.json(),
        store,
        item,
      );
      cache.set(cacheKey, { at: now, products });
      return products;
    } catch (error) {
      blockedUntil = Date.now() + 5 * 60000;
      throw Error(
        `Open Food Facts lookup failed (${error instanceof Error ? error.message : "network error"}). Browser/network restrictions or provider downtime may prevent access. No retailer catalogue or stock connection is configured. Generic estimates remain available.`,
      );
    } finally {
      clearTimeout(timeout);
    }
  },
};
