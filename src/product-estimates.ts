import type { ShoppingItem } from "./domain";
// Broad planning allowances in AUD, not observed retailer prices. No brands,
// stock assertions or weight/volume density conversions. See docs/SHOPPING-DATA.md.
const allowances: Array<[RegExp, "g" | "ml" | "each", number, number]> = [
  [/tomato paste|tomato puree/, "g", 200, 3],
  [/chicken|turkey/, "g", 500, 8],
  [/beef|lamb|pork/, "g", 500, 10],
  [/salmon|prawn|fish fillet/, "g", 500, 15],
  [/tuna/, "g", 185, 3],
  [/rice|flour|sugar/, "g", 1000, 3],
  [/pasta|spaghetti|noodle|couscous|lentil/, "g", 500, 3],
  [/oats/, "g", 750, 3],
  [/olive oil|vegetable oil/, "ml", 500, 8],
  [/cream|coconut milk/, "ml", 400, 4],
  [/milk/, "ml", 1000, 3],
  [/soy sauce|vinegar/, "ml", 250, 3],
  [/stock|broth/, "ml", 1000, 3],
  [/egg(s)?$/, "each", 12, 7],
  [/yoghurt/, "g", 1000, 6],
  [/cheese|cheddar|mozzarella/, "g", 500, 7],
  [/butter/, "g", 250, 4],
  [
    /salt|black pepper|white pepper|ground pepper|^pepper$|paprika|cumin|cinnamon|oregano|curry powder|chilli powder|turmeric/,
    "g",
    40,
    3,
  ],
  [/almond|walnut|cashew|peanut/, "g", 250, 5],
  [/tinned tomato|canned tomato|chickpea|canned bean/, "g", 400, 2],
  [
    /potato|carrot|onion|tomato|broccoli|spinach|mushroom|capsicum|zucchini|cucumber|apple|banana|pear/,
    "g",
    500,
    4,
  ],
  [
    /potato|carrot|onion|tomato|apple|banana|pear|lemon|lime|capsicum|zucchini|cucumber/,
    "each",
    1,
    1.5,
  ],
  [/bread/, "g", 650, 4],
];
export function estimateIngredient(
  i: Pick<ShoppingItem, "name" | "unit" | "prepared">,
  packageSize?: number,
) {
  if (i.prepared) return undefined;
  const name = i.name.toLowerCase();
  // Do not price a sauce, stock powder or spread as the underlying meat/nut.
  if (/\b(stock|broth)\b/.test(name) && i.unit === "g") return undefined;
  if (
    /\b(sauce|spread|butter)\b/.test(name) &&
    !/^(soy sauce|butter)$/.test(name)
  )
    return undefined;
  // More specific patterns must precede broad ones.
  const record = allowances.find(
    ([pattern, unit]) =>
      unit === i.unit &&
      new RegExp("\\b(?:" + pattern.source + ")(?:s|es)?\\b").test(
        i.name.toLowerCase(),
      ),
  );
  if (!record) return undefined;
  const size = packageSize ?? record[2];
  return {
    size,
    price: Math.max(0.5, Math.round(((record[3] * size) / record[2]) * 2) / 2),
    source: "estimate" as const,
    priceLabel: "Estimated price",
    availabilityLabel: "Availability unknown",
    shop: "Generic Australian retail allowance — not a retailer quote",
  };
}
