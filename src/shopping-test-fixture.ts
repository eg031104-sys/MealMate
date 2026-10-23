import { defaults, type ShoppingItem } from "./domain";
import { emptyV2, type State } from "./v2-state";
import { emptyV3, type StoreProduct } from "./v3-state";
export const ingredient: ShoppingItem = {
  key: "tomato paste|g",
  name: "Tomato paste",
  unit: "g",
  quantity: 70,
  department: "Pantry",
};
export function shoppingFixture(): State {
  const v3 = emptyV3();
  v3.stores = [
    {
      id: "test-store",
      chain: "Coles",
      name: "Synthetic test branch",
      suburb: "Test",
      postcode: "4000",
      address: "",
      origin: "user",
    },
  ];
  v3.primary = "test-store";
  return {
    settings: { ...defaults, categories: ["Dinner"] },
    recipes: [
      {
        id: "test-recipe",
        name: "Test fixture recipe",
        category: "Dinner",
        servings: 2,
        prep: 5,
        cook: 10,
        appliances: [],
        diet: [],
        emoji: "",
        colour: "",
        instructions: ["Test only"],
        ingredients: [ingredient],
      },
    ],
    plan: [
      {
        day: 0,
        category: "Dinner",
        recipeId: "test-recipe",
        people: 2,
        appetite: 1,
        locked: true,
      },
    ],
    week: "2026-10-19",
    pantry: [],
    checked: [],
    v2: emptyV2(),
    v3,
  };
}
export const testProduct = (
  id = "test-product",
  size = 200,
  price?: number,
): StoreProduct => ({
  id,
  storeId: "test-store",
  ingredientKey: ingredient.key,
  name: "Synthetic fixture tomato paste",
  brand: "Test brand (not real)",
  unit: "g",
  size,
  price,
  source: "user",
  availability: "unknown",
});
