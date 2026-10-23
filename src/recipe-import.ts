import type { Recipe, Ingredient } from "./domain";
import { usable } from "./domain";
import { recipeSchema } from "./v2-state";
export interface RecipeSource {
  id: string;
  name: string;
  terms: string;
  search(query: string): Promise<Recipe[]>;
}
export function metricMeasure(
  text: string,
): { quantity: number; unit: Ingredient["unit"] } | undefined {
  const match = text
    .trim()
    .toLowerCase()
    .match(
      /^(\d+(?:\.\d+)?|\d+\/\d+)\s*(kg|g|grams?|ml|millilitres?|l|litres?|oz|ounces?|lb|lbs|each)?$/,
    );
  if (!match) return;
  const n = match[1].includes("/")
    ? +match[1].split("/")[0] / +match[1].split("/")[1]
    : +match[1];
  if (!Number.isFinite(n) || n <= 0) return;
  const u = match[2] ?? "each";
  if (u === "kg") return { quantity: n * 1000, unit: "g" };
  if (["oz", "ounce", "ounces", "lb", "lbs"].includes(u))
    return {
      quantity: n * (u.startsWith("o") ? 28.349523125 : 453.59237),
      unit: "g",
    };
  if (["l", "litre", "litres"].includes(u))
    return { quantity: n * 1000, unit: "ml" };
  return {
    quantity: n,
    unit:
      u === "each" ? "each" : u === "g" || u.startsWith("gram") ? "g" : "ml",
  };
}
export function fromMealDB(raw: Record<string, unknown>): Recipe {
  const text = (k: string) =>
    typeof raw[k] === "string" ? String(raw[k]).trim() : "";
  const review = [
    "Confirm standard servings, preparation/cooking times, dietary tags and appliances before planning.",
  ];
  const ingredients: Ingredient[] = [];
  for (let n = 1; n <= 20; n++) {
    const name = text(`strIngredient${n}`);
    if (!name) continue;
    const measure = text(`strMeasure${n}`);
    const metric = metricMeasure(measure);
    if (!metric)
      review.push(`Check quantity: ${name} — ${measure || "not supplied"}`);
    ingredients.push({
      name,
      quantity: metric?.quantity ?? 0,
      unit: metric?.unit ?? "g",
      department: "Imported — review department",
      rawMeasure: measure,
    });
  }
  return {
    id: `themealdb-${text("idMeal")}`,
    name: text("strMeal"),
    category:
      text("strCategory") === "Breakfast"
        ? "Breakfast"
        : text("strCategory") === "Side"
          ? "Sides"
          : text("strCategory") === "Dessert"
            ? "Snacks"
            : "Dinner",
    origin: "external",
    cuisine: text("strArea"),
    description: `Imported from TheMealDB · ${text("strArea")} · ${text("strCategory")}`,
    servings: 0,
    prep: 0,
    cook: 0,
    diet: [],
    appliances: [],
    ingredients,
    instructions: text("strInstructions").split(/\r?\n/).filter(Boolean),
    emoji: "🍽️",
    colour: "#e7eedb",
    image: text("strMealThumb"),
    photo: text("strMealThumb")
      ? {
          url: text("strMealThumb"),
          author: "TheMealDB contributors",
          license: "TheMealDB API artwork terms — personal/development use",
          sourceUrl: "https://www.themealdb.com/terms_of_use.php",
          cacheAllowed: false,
        }
      : undefined,
    source: {
      name: "TheMealDB",
      url: `https://www.themealdb.com/meal/${text("idMeal")}`,
      license:
        "TheMealDB API terms — personal/development use; retain attribution",
      externalId: text("idMeal"),
    },
    review,
  };
}
export const mealDB: RecipeSource = {
  id: "themealdb",
  name: "TheMealDB (personal/development API)",
  terms: "https://www.themealdb.com/terms_of_use.php",
  async search(query) {
    const response = await fetch(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw Error(
        "Recipe source is unavailable. Your local library still works offline.",
      );
    const result = await response.json();
    return (result.meals ?? []).slice(0, 100).map(fromMealDB);
  },
};
export function normaliseRecipe(raw: unknown): Recipe {
  const recipe = recipeSchema.parse(raw) as Recipe;
  const review = [...(recipe.review ?? [])];
  if (!recipe.servings) review.push("Serving size must be supplied.");
  if (recipe.ingredients.some((i) => i.quantity <= 0 && !i.excludeFromShopping))
    review.push("Every ingredient needs a positive measured quantity.");
  if (!recipe.ingredients.length || !recipe.instructions.length)
    review.push("Ingredients and instructions are required.");
  const aliases: Record<string, string> = {
    courgette: "Zucchini",
    aubergine: "Eggplant",
    cilantro: "Coriander",
    "bell pepper": "Capsicum",
    scallion: "Spring onion",
  };
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      name: aliases[i.name.trim().toLowerCase()] ?? i.name.trim(),
    })),
    review: [...new Set(review)],
  };
}
export function importRecipes(
  existing: Recipe[],
  incoming: unknown[],
): { recipes: Recipe[]; added: number; duplicates: number } {
  if (incoming.length > 5000)
    throw Error("Import at most 5,000 recipes at once.");
  const validated = incoming.map(normaliseRecipe);
  const recipes = [...existing];
  let duplicates = 0;
  for (const r of validated) {
    if (
      recipes.some(
        (old) =>
          old.id === r.id ||
          old.name.trim().toLowerCase() === r.name.trim().toLowerCase() ||
          (r.source?.externalId &&
            old.source?.name === r.source.name &&
            old.source?.externalId === r.source.externalId),
      )
    ) {
      duplicates++;
      continue;
    }
    recipes.push(r);
  }
  return { recipes, added: recipes.length - existing.length, duplicates };
}
export function reviewReady(recipe: Recipe) {
  return usable({ ...recipe, review: [] });
}
export const recipeTemplate: Recipe = {
  id: "my-recipe-" + Date.now(),
  origin: "household",
  name: "My household recipe",
  description: "",
  category: "Dinner",
  servings: 2,
  prep: 10,
  cook: 20,
  diet: [],
  appliances: ["Hob"],
  ingredients: [
    { name: "Rice", quantity: 150, unit: "g", department: "Pantry & grains" },
  ],
  instructions: ["Replace this with your complete cooking instructions."],
  emoji: "🍽️",
  colour: "#e7eedb",
  source: { name: "Household original", url: "", license: "Household recipe" },
  review: ["Edit the template and confirm every field before marking ready."],
};
