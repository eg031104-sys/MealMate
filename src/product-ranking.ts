import type { StoreProduct } from "./v3-state";
import { estimateIngredient } from "./product-estimates";
import type { ShoppingItem } from "./domain";
export type ShoppingPreference = "Budget" | "Balanced" | "Premium";
export function rankProducts(
  products: StoreProduct[],
  item: ShoppingItem,
  required: number,
  preference: ShoppingPreference,
  selected?: string,
  price: (p: StoreProduct) => number | undefined = (p) => p.price,
  blocked: (p: StoreProduct) => boolean = (p) =>
    p.availability === "unavailable",
) {
  const cost = (p: StoreProduct) =>
    price(p) ?? estimateIngredient(item, p.size)?.price;
  const costs = products
    .map((p) => cost(p))
    .filter((n): n is number => n !== undefined);
  const cheapestUnit = Math.min(
    ...products
      .filter((p) => cost(p) !== undefined)
      .map((p) => cost(p)! / p.size),
  );
  const cheapestBasket = Math.min(
    ...products
      .filter((p) => cost(p) !== undefined)
      .map((p) => Math.ceil(required / p.size) * cost(p)!),
  );
  function score(p: StoreProduct) {
    const packs = Math.ceil(Number((required / p.size).toFixed(8)));
    const purchase = packs * (cost(p) ?? 0);
    const waste = required > 0 ? (packs * p.size - required) / required : 0;
    const suitability = p.suitability ?? 1; // Manual records are explicitly matched by the user.
    if (!costs.length || costs.length < 3)
      return (
        (1 - suitability) * 10 +
        waste * 0.2 +
        (cost(p) === undefined ? 1 : purchase / (cheapestBasket || 1))
      );
    const unitRatio = (cost(p) ?? 0) / p.size / (cheapestUnit || 1);
    const basketRatio = purchase / (cheapestBasket || 1);
    if (preference === "Budget")
      return basketRatio + Math.min(waste, 1) * 0.05 + (1 - suitability) * 4;
    // Premium means better ingredient suitability, not "most expensive".
    return (
      (1 - suitability) * (preference === "Premium" ? 12 : 5) +
      basketRatio * 0.55 +
      unitRatio * 0.25 +
      waste * 0.6 -
      (p.id === selected ? 0.4 : 0)
    );
  }
  return [...products].sort(
    (a, b) =>
      Number(blocked(a)) - Number(blocked(b)) ||
      Number(a.source === "demo" || a.source === "estimate") -
        Number(b.source === "demo" || b.source === "estimate") ||
      Number(cost(a) === undefined) - Number(cost(b) === undefined) ||
      score(a) - score(b) ||
      a.id.localeCompare(b.id),
  );
}
