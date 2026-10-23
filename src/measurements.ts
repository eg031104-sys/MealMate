import moreDefaults from "./data/measurement-defaults.json";
import type { Ingredient, Recipe } from "./domain";
export type Estimate = { quantity: number; unit: "g" | "ml" | "each" };
export type MeasurementOverrides = Record<string, Estimate>;
export const defaultEstimates: MeasurementOverrides = {
  ...(moreDefaults as MeasurementOverrides),
  "spinach|handful": { quantity: 30, unit: "g" },
  "grated cheese|handful": { quantity: 30, unit: "g" },
  "almonds|handful": { quantity: 30, unit: "g" },
  "parsley|handful": { quantity: 15, unit: "g" },
  "coriander|handful": { quantity: 15, unit: "g" },
  "basil|handful": { quantity: 15, unit: "g" },
  "salt|pinch": { quantity: 0.3, unit: "g" },
  "pepper|pinch": { quantity: 0.2, unit: "g" },
  "olive oil|splash": { quantity: 5, unit: "ml" },
  "vegetable oil|splash": { quantity: 5, unit: "ml" },
  "butter|knob": { quantity: 10, unit: "g" },
};
export function estimateIngredient(
  i: Ingredient,
  overrides: MeasurementOverrides = {},
): Ingredient {
  if (!i.estimateKey) return i;
  const rule = overrides[i.estimateKey] ?? defaultEstimates[i.estimateKey];
  if (!rule) return i;
  return {
    ...i,
    quantity: rule.quantity * (i.estimateMultiplier ?? 1),
    unit: rule.unit,
    approximate: true,
    excludeFromShopping: false,
  };
}
export function applyRecipeEstimates(
  recipe: Recipe,
  overrides: MeasurementOverrides = {},
): Recipe {
  if (!recipe.ingredients.some((i) => i.estimateKey)) return recipe;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((i) =>
      estimateIngredient(i, overrides),
    ),
  };
}
const aliases: Record<string, string> = {
  "bell pepper": "capsicum",
  cilantro: "coriander",
  courgette: "zucchini",
  aubergine: "eggplant",
  scallion: "spring onion",
  "ground beef": "beef mince",
  "ground pork": "pork mince",
  "all-purpose flour": "plain flour",
  cornstarch: "cornflour",
};
export function ingredientName(name: string) {
  return aliases[name.toLowerCase().trim()] ?? name.trim();
}
export function approximateMeasure(
  name: string,
  raw: string,
  overrides: MeasurementOverrides = {},
): Partial<Ingredient> | undefined {
  const text = raw.toLowerCase().trim(),
    lower = ingredientName(name).toLowerCase();
  const kind = /handful/.test(text)
    ? "handful"
    : /pinch/.test(text)
      ? "pinch"
      : /splash|drizzle/.test(text)
        ? "splash"
        : /knob/.test(text)
          ? "knob"
          : /to taste|as needed/.test(text)
            ? "to taste"
            : undefined;
  if (!kind) return;
  const key = `${lower}|${kind}`;
  const numeric = text
    .replace(/(\d)([¼½¾])/g, "$1 $2")
    .replace(/¼/g, "1/4")
    .replace(/½/g, "1/2")
    .replace(/¾/g, "3/4");
  const count = numeric.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s/);
  const n = count
    ? count[1].split(/\s+/).reduce((sum, v) => {
        const [a, b] = v.split("/").map(Number);
        return sum + a / (b ?? 1);
      }, 0)
    : 1;
  if (!Number.isFinite(n) || n <= 0) return;
  const rule = overrides[key] ?? defaultEstimates[key];
  if (rule)
    return {
      quantity: rule.quantity * n,
      unit: rule.unit,
      rawMeasure: raw,
      approximate: true,
      estimateKey: key,
      estimateMultiplier: n,
      measurementNote:
        "Configurable ingredient-specific estimate, not an exact source measurement.",
    };
  if (kind === "to taste")
    return {
      quantity: 0,
      unit: "g",
      rawMeasure: raw,
      excludeFromShopping: true,
      estimateKey: key,
      estimateMultiplier: n,
      measurementNote:
        "Unquantified source seasoning; excluded from exact shopping totals unless an estimate is explicitly configured.",
    };
}
