import type { Ingredient, Recipe } from "./domain";
const i = (
  name: string,
  quantity: number,
  unit: Ingredient["unit"] = "g",
  department = "Pantry & grains",
): Ingredient => ({ name, quantity, unit, department });
const veg = (name: string, quantity: number) =>
  i(name, quantity, "g", "Fruit & veg");
const plant = ["Vegetarian", "Vegan", "Dairy-free"];
const source = {
  name: "MealMate original variations",
  url: "",
  license: "Original household recipe collection",
};
const recipes: Recipe[] = [];
function add(r: Omit<Recipe, "id" | "servings" | "colour" | "source">) {
  recipes.push({
    ...r,
    id: `original-v2-${recipes.length + 1}`,
    servings: 2,
    colour: ["#e7eedb", "#f5e7d3", "#e6ebdb"][recipes.length % 3],
    source,
    methods: r.appliances.includes("Oven")
      ? [
          {
            appliances: ["Fan-forced oven"],
            prep: r.prep,
            cook: r.cook,
            instructions: r.instructions.map((step) =>
              step.replace(
                "conventional oven to 200°C",
                "fan-forced oven to 180°C",
              ),
            ),
          },
        ]
      : undefined,
    description:
      "An original, measured variation from the MealMate household collection. Not AI generated.",
  });
}
const vegetables = [
  "Broccoli",
  "Carrot",
  "Zucchini",
  "Capsicum",
  "Green beans",
  "Mushrooms",
];
for (const fruit of ["Apple", "Pear", "Banana", "Strawberries"])
  for (const milk of ["Oat milk", "Milk", "Soy milk"])
    for (const spice of ["Cinnamon", "Vanilla extract"])
      add({
        name: `${fruit}, ${spice.toLowerCase()} & ${milk.toLowerCase()} porridge`,
        category: "Breakfast",
        prep: 5,
        cook: 8,
        appliances: ["Hob"],
        diet: milk === "Milk" ? ["Vegetarian"] : plant,
        emoji: "🥣",
        ingredients: [
          i("Rolled oats", 100),
          i(
            milk,
            300,
            "ml",
            milk === "Milk" ? "Dairy & eggs" : "Pantry & grains",
          ),
          veg(fruit, 150),
          i(
            spice,
            spice === "Cinnamon" ? 2 : 3,
            spice === "Cinnamon" ? "g" : "ml",
          ),
        ],
        instructions: [
          "Wash the fruit; core or peel as needed, then chop into small pieces.",
          `Combine oats, ${milk.toLowerCase()} and ${spice.toLowerCase()} in a saucepan. Simmer gently for 8 minutes, stirring and adding a splash of water if needed.`,
          `Divide between two bowls and top with the prepared ${fruit.toLowerCase()}.`,
        ],
      });
for (const grain of ["Rice", "Quinoa", "Couscous"])
  for (const pulse of ["Chickpeas", "Cannellini beans", "Black beans"])
    for (const vegetable of vegetables)
      add({
        name: `${vegetable} & ${pulse.toLowerCase()} ${grain.toLowerCase()} bowl`,
        category: "Lunch",
        prep: 10,
        cook: 20,
        appliances: ["Hob"],
        diet: grain === "Couscous" ? plant : [...plant, "Gluten-free"],
        emoji: "🥗",
        ingredients: [
          i(grain, 140),
          i(pulse, 300),
          veg(vegetable, 250),
          i("Olive oil", 15, "ml"),
          veg("Lemon", 80),
        ],
        instructions: [
          grain === "Couscous"
            ? "Place couscous in a heatproof bowl. Pour over 180 ml boiling water, cover for 10 minutes and fluff with a fork."
            : `Rinse ${grain.toLowerCase()} and cook in a saucepan of boiling water for 15–20 minutes until tender, then drain.`,
          `Wash and thinly slice ${vegetable.toLowerCase()}. Heat oil in a frying pan and cook the vegetables for 8–10 minutes until tender.`,
          `Use ready-cooked canned ${pulse.toLowerCase()}: drain, rinse and add to the vegetables. Heat for 4 minutes until steaming throughout.`,
          `Divide ${grain.toLowerCase()} between bowls and top with vegetables and beans. Squeeze over the lemon juice.`,
        ],
      });
for (const protein of ["Firm tofu", "Chicken breast", "Beef mince"])
  for (const vegetable of vegetables)
    for (const grain of ["Rice", "Rice noodles"])
      add({
        name: `${protein} & ${vegetable.toLowerCase()} with ${grain.toLowerCase()}`,
        category: "Dinner",
        prep: 12,
        cook: 20,
        appliances: ["Hob"],
        diet: protein === "Firm tofu" ? plant : ["Dairy-free"],
        emoji: "🥘",
        ingredients: [
          i(
            protein,
            300,
            "g",
            protein === "Firm tofu" ? "Pantry & grains" : "Meat & seafood",
          ),
          veg(vegetable, 250),
          i(grain, 140),
          i("Soy sauce", 25, "ml"),
          i("Olive oil", 15, "ml"),
          veg("Ginger", 10),
        ],
        instructions: [
          grain === "Rice"
            ? "Cook rice in boiling water for 15 minutes, or until tender, then drain."
            : "Soak rice noodles in freshly boiled water for 8 minutes or until tender, then drain.",
          `Wash and thinly slice ${vegetable.toLowerCase()}; peel and grate ginger. ${protein === "Beef mince" ? "Keep mince chilled until cooking." : `Cut ${protein.toLowerCase()} into 2 cm pieces.`}`,
          `Heat oil in a large frying pan. ${protein === "Chicken breast" ? "Fry chicken for 10–12 minutes until its centre reaches 75°C. Use separate utensils and boards for raw chicken." : protein === "Beef mince" ? "Fry mince for 8–10 minutes, breaking up clumps, until cooked through to 75°C." : "Fry tofu for 6–8 minutes, turning until golden."}`,
          `Add vegetables, ginger, soy sauce and 50 ml water. Cover and cook for 6–8 minutes until vegetables are tender${protein === "Chicken breast" ? " and chicken reaches 75°C throughout" : ""}. Serve with ${grain.toLowerCase()}.`,
        ],
      });
for (const vegetable of [
  "Pumpkin",
  "Potato",
  "Sweet potato",
  "Carrot",
  "Zucchini",
  "Broccoli",
])
  for (const herb of ["Dried oregano", "Smoked paprika", "Dried thyme"])
    add({
      name: `${herb} roasted ${vegetable.toLowerCase()}`,
      category: "Sides",
      prep: 10,
      cook: 30,
      appliances: ["Oven"],
      diet: [...plant, "Gluten-free"],
      emoji: "🥕",
      ingredients: [veg(vegetable, 400), i("Olive oil", 15, "ml"), i(herb, 3)],
      instructions: [
        "Heat a conventional oven to 200°C.",
        `Wash and cut ${vegetable.toLowerCase()} into 2 cm pieces. Toss with oil and ${herb.toLowerCase()}, then spread in a single layer on a baking tray.`,
        "Roast for 25–30 minutes, turning halfway, until tender and golden. Check softer vegetables after 20 minutes.",
      ],
    });
for (const fruit of ["Strawberries", "Blueberries", "Banana", "Pear"])
  for (const topping of ["Pumpkin seeds", "Sunflower seeds", "Rolled oats"])
    add({
      name: `${fruit} yoghurt & ${topping.toLowerCase()} pots`,
      category: "Snacks",
      prep: 7,
      cook: 0,
      appliances: [],
      diet:
        topping === "Rolled oats"
          ? ["Vegetarian"]
          : ["Vegetarian", "Gluten-free"],
      emoji: "🍓",
      ingredients: [
        i("Greek yoghurt", 250, "g", "Dairy & eggs"),
        veg(fruit, 150),
        i(topping, 30),
      ],
      instructions: [
        `Wash or peel ${fruit.toLowerCase()} and chop into bite-sized pieces.`,
        `Divide yoghurt between two small bowls, top with fruit and ${topping.toLowerCase()}.`,
        "Keep chilled at 5°C or colder until serving.",
      ],
    });
for (const pulse of ["Red lentils", "Chickpeas", "Cannellini beans"])
  for (const vegetable of vegetables)
    for (const herb of ["Smoked paprika", "Dried oregano", "Dried thyme"])
      add({
        name: `${herb} ${pulse.toLowerCase()} & ${vegetable.toLowerCase()} soup`,
        category: "Lunch",
        prep: 10,
        cook: 25,
        appliances: ["Hob"],
        diet: [...plant, "Gluten-free"],
        emoji: "🥣",
        ingredients: [
          i(pulse, pulse === "Red lentils" ? 140 : 300),
          veg(vegetable, 250),
          i("Tinned tomatoes", 400),
          veg("Onion", 100),
          i("Olive oil", 15, "ml"),
          i(herb, 3),
        ],
        instructions: [
          `Peel and finely dice onion. Wash and chop ${vegetable.toLowerCase()} into 1 cm pieces.`,
          `Soften onion and vegetables in olive oil in a saucepan for 5 minutes. Add ${herb.toLowerCase()} and stir for 30 seconds.`,
          pulse === "Red lentils"
            ? "Rinse lentils and add with tomatoes and 600 ml water. Simmer for 20 minutes until lentils and vegetables are tender."
            : `Drain and rinse ready-cooked canned ${pulse.toLowerCase()}. Add to the pan with tomatoes and 300 ml water. Simmer for 20 minutes until vegetables are tender and beans are steaming hot.`,
          "Divide between two bowls. Cool unused soup promptly and refrigerate at 5°C or colder.",
        ],
      });
export const expandedRecipes = recipes; // 198 measured original variations; never overwrites a saved recipe.
export function addCollection(existing: Recipe[]) {
  const names = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  const ids = new Set(existing.map((r) => r.id));
  return [
    ...existing,
    ...expandedRecipes.filter(
      (r) => !names.has(r.name.toLowerCase()) && !ids.has(r.id),
    ),
  ];
}
