import type { Category, Ingredient, Recipe } from "./domain";
import { defaultEstimates, ingredientName } from "./measurements";
import decisions from "../scripts/recipes/decisions.json";
type Decision = {
  parsing?: Record<string, string>;
  omit?: string[];
  extra?: string[];
  notes?: string;
  wait?: number;
  cook?: number;
  appliances?: string[];
  preparedIngredients?: string[];
  review?: string[];
  approximateNames?: string[];
  instructionReplacements?: Record<string, string>;
};
export type SourceCandidate = {
  slug: string;
  name: string;
  author: string;
  servings: number;
  yieldLabel: string;
  prep: number | null;
  cook: number | null;
  ingredients: string[];
  instructions: string[];
  photo: string | null;
};
const fractions: Record<string, string> = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
  "²": "2",
};
export function numericText(text: string) {
  return text
    .replace(/⁄/g, "/")
    .replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞²]/g, (c) => fractions[c]);
}
export function sourceNumber(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .reduce((a, part) => {
      const [n, d] = part.split("/").map(Number);
      return a + n / (d ?? 1);
    }, 0);
}
const aliases: Record<string, string> = {
  "all purpose flour": "plain flour",
  "all-purpose flour": "plain flour",
  "wheat flour": "flour",
  "ap flour": "plain flour",
  "bread flour": "flour",
  "white flour": "flour",
  "whole wheat flour": "wholemeal flour",
  "whole green onions": "spring onion",
  "green bell peppers": "green capsicum",
  "yellow onions": "onion",
  bananas: "banana",
  "red chilies": "red chilli",
  "more powdered sugar": "icing sugar",
  "salted water": "water",
  "ginger thumb": "ginger",
  "dried fruit": "dried fruit",
  "cooked chicken": "cooked chicken",
  "prepared sliced meat": "cooked sliced meat",
  "frozen peas and carrots": "frozen peas and carrots",
  "whole cloves": "cloves",
  "sweet paprika": "paprika",
  "thyme and rosemary": "mixed thyme and rosemary",
  "mixed thyme and rosemary": "mixed thyme and rosemary",
  "bacon rashers": "bacon",
  wraps: "wrap",
  "free-range eggs": "egg",
  "vanilla flavouring": "vanilla extract",

  leeks: "leek",
  shallots: "shallot",
  lemons: "lemon",
  limes: "lime",
  "cubes chicken bouillon": "chicken stock cube",
  "cubes chicken stock": "chicken stock cube",
  "basil and parmesan": "basil and parmesan garnish",
  "spicy chorizo": "chorizo",
  oil: "vegetable oil",
  "minced lamb": "lamb mince",
  "sweet or smoked paprika": "paprika",
  "summer squash": "squash",
  parsnips: "parsnip",
  "fennel bulbs": "fennel",
  "smoked duck breast": "smoked duck breast",
  "garlic pearls": "garlic clove",
  "white pepper powder": "white pepper",
  "garlic puree": "garlic paste",

  "frozen peas": "peas",
  "red paper flakes": "chilli flakes",
  "red-pepper flakes": "chilli flakes",
  "fresh basil leaves": "basil",
  "basil leaves": "basil",
  "coriander leaves / cilantro": "coriander",
  "italian spaghetti": "pasta",
  linguine: "pasta",
  fusilli: "pasta",
  "uncooked pasta": "pasta",
  "tinned chopped tomatoes": "tinned tomatoes",
  "mealy/floury potatoes": "potato",
  "new potato": "potato",
  "roma tomatoes": "tomato",
  "plum tomatoes": "tomato",
  "yukon gold potatoes": "potato",
  "sweet yellow onion": "onion",
  "sweet bell pepper": "capsicum",
  "sweet peppers": "capsicum",
  "green onions": "spring onion",
  "green onion": "spring onion",
  "scallions white and green separated": "spring onion",
  "white rice": "rice",
  "soft bread crumb": "breadcrumbs",
  "self-raising flour": "self-raising flour",
  "italian plum tomatoes": "tinned tomatoes",
  "cremini brown mushrooms": "mushrooms",
  "parmesan-romano cheese blend": "parmesan-romano cheese",
  "roasted cashews": "cashews",
  "ground pepper": "pepper",
  "powdered garlic": "garlic powder",
  "whole eggs": "egg",
  "ice water": "water",
  "pama porridge rice": "porridge rice",
  "oat flakes": "oats",
  "crushed hazelnuts": "hazelnuts",
  hazelnuts: "hazelnuts",
  parsely: "parsley",
  "chicken bullion cube": "chicken stock cube",
  "stock cube": "stock cube",
  "chicken bouillon cube": "chicken stock cube",
  "chicken bouillon": "chicken stock",
  "boiling water": "water",
  "flour t45": "flour",
  "red chili pepper": "red chilli",
  "chili pepper": "chilli",
  chili: "chilli",
  "chili garlic sauce": "chilli garlic sauce",
  "sweet chili sauce": "sweet chilli sauce",
  "tomato paste/puree": "tomato paste",
  shrimp: "prawns",
  "uncooked peeled shrimp": "raw peeled prawns",
  "uncoocked peeled shrimp": "raw peeled prawns",
  "greek yoghurt": "greek yoghurt",
  "baby tomatoes": "cherry tomatoes",
  "general purpose flour": "plain flour",
  "white whine": "white wine",
  "butter or margarine": "butter",
  "thyme or oregano": "thyme",
  "paprika or cayenne pepper if you want heat": "paprika",
  "salted capers": "capers",
  "gaeta olives": "olives",
  "grated cheese": "grated cheese",

  "powdered sugar": "icing sugar",
  "granulated sugar": "sugar",
  "white sugar": "sugar",
  "caster sugar": "sugar",
  "chicken breasts": "chicken breast",
  "chicken thighs": "chicken thigh",
  "chicken drumsticks": "chicken drumstick",
  onions: "onion",
  "yellow onion": "onion",
  "white onion": "onion",
  "red onions": "red onion",
  carrots: "carrot",
  tomatoes: "tomato",
  potatoes: "potato",
  "new potatoes": "potato",
  "white potatoes": "potato",
  "russet potatoes": "potato",
  "yukon potatoes": "potato",
  "sweet potatoes": "sweet potato",
  aubergines: "eggplant",
  courgettes: "zucchini",
  courgette: "zucchini",
  "bell pepper": "capsicum",
  "red bell pepper": "red capsicum",
  "green bell pepper": "green capsicum",
  "yellow bell pepper": "yellow capsicum",
  "red pepper": "red capsicum",
  "green pepper": "green capsicum",
  "yellow pepper": "yellow capsicum",
  "garlic cloves": "garlic clove",
  "cloves garlic": "garlic clove",
  garlic: "garlic clove",
  "head of garlic": "garlic bulb",
  "garlic head": "garlic bulb",
  "olive oil": "olive oil",
  "extra virgin olive oil": "olive oil",
  "extra-virgin olive oil": "olive oil",
  evoo: "olive oil",
  "ground beef": "beef mince",
  "ground beef meat": "beef mince",
  "ground pork": "pork mince",
  "minced beef": "beef mince",
  "minced pork": "pork mince",
  "ground chicken": "chicken mince",
  "chopped tomatoes": "tinned tomatoes",
  "canned tomatoes": "tinned tomatoes",
  "diced tomatoes": "tinned tomatoes",
  "crushed tomatoes": "tinned tomatoes",
  "tomato purée": "tomato paste",
  "tomato puree": "tomato paste",
  "tomato puré": "tomato paste",
  scallions: "spring onion",

  "spring onions": "spring onion",

  "fresh coriander": "coriander",
  cilantro: "coriander",
  "minced fresh parsley": "parsley",
  "fresh parsley": "parsley",
  "fresh basil": "basil",
  "fresh thyme": "thyme",
  "fresh rosemary": "rosemary",
  "bay leaves": "bay leaf",
  eggs: "egg",
  "egg yolks": "egg yolk",
  "egg whites": "egg white",
  cheddar: "cheddar cheese",
  "grated cheddar": "cheddar cheese",
  parmigiano: "parmesan",
  "parmigiano reggiano": "parmesan",
  "parmigiano-reggiano": "parmesan",
  "parmesan cheese": "parmesan",
  "pecorino romano": "pecorino",
  "grated parmesan": "parmesan",
  "mozzarella cheese": "mozzarella",
  "scamorza cheese": "scamorza",
  breadcrumbs: "breadcrumbs",
  "bread crumbs": "breadcrumbs",
  "panko breadcrumbs": "breadcrumbs",
  "rolled oats": "oats",
  oatmeal: "oats",
  "large flake oats": "oats",
  "large flake rolled oats": "oats",
  "brown lentils": "lentils",
  "dry brown lentils": "lentils",
  "dried lentils": "lentils",
  "whole milk": "milk",
  "full fat milk": "milk",
  "full-fat milk": "milk",
  "whole fat milk": "milk",
  "double cream": "cream",
  "heavy cream": "cream",
  "whipping cream": "cream",
  "chicken broth": "chicken stock",
  "beef broth": "beef stock",
  "vegetable broth": "vegetable stock",

  "beef bouillon": "beef stock",
  "heavy whipping cream": "cream",
  "basmati rice": "rice",
  "jasmine rice": "rice",
  "arborio rice": "rice",
  "regular rice": "rice",
  "long grain white rice": "rice",
  "baby spinach": "spinach",
  "italian parsley": "parsley",
  "italian breadcrumbs": "breadcrumbs",
  "unseasoned breadcrumbs": "breadcrumbs",
  "light soy sauce": "soy sauce",
  "dark soy sauce": "soy sauce",
  "raw quinoa": "quinoa",
  "high quality olive oil": "olive oil",
  "creamy peanut butter": "peanut butter",
  "hot water": "water",
  "warm water": "water",
  "very hot water": "water",
  "cracked wheat": "bulgur",
  "bulghur wheat": "bulgur",
  bulghur: "bulgur",
  "sharp cheddar cheese": "cheddar cheese",
  "broccoli pieces": "broccoli",
  "small broccoli florets": "broccoli",
  "black pepper freshly grounded": "pepper",

  cornstarch: "cornflour",
  "corn flour": "cornflour",
  "corn flakes": "cornflakes",
  "black pepper": "pepper",
  "ground black pepper": "pepper",
  "freshly ground black pepper": "pepper",
  "kosher salt": "salt",
  "sea salt": "salt",
  "flaky sea salt": "salt",
  "fine salt": "salt",
  "fine sea salt": "salt",
  "dried oregano": "oregano",
  "dried thyme": "thyme",
  "cinnamon powder": "cinnamon",
  "ground cinnamon": "cinnamon",
  "nutmeg powder": "nutmeg",
  "ground nutmeg": "nutmeg",
  "paprika powder": "paprika",
  "turmeric powder": "turmeric",
  "chili powder": "chilli powder",
  "chile powder": "chilli powder",
  "red pepper flakes": "chilli flakes",
  "ground cumin": "cumin",
  "cumin powder": "cumin",
  "ground coriander": "ground coriander",
  "fresh ginger": "ginger",
  "ground ginger": "ground ginger",
  "unsalted butter": "butter",
  "salted butter": "butter",
  "softened butter": "butter",
  "melted butter": "butter",
  "bacon strips": "bacon",
  "bacon cubes": "bacon",
  "bacon lardon": "bacon",
  "canola oil": "vegetable oil",
  "neutral oil": "vegetable oil",
  "cooking oil": "vegetable oil",
  sourcream: "sour cream",
  yogurt: "yoghurt",
  "greek yogurt": "greek yoghurt",
  "natural yogurt": "yoghurt",
  "plain yogurt": "yoghurt",
  "frozen green peas": "peas",
  "green peas": "peas",
  "black-eyed peas": "black-eyed beans",
  "cannellini beans": "white beans",
  "white cannellini beans": "white beans",
  "plain white rice": "rice",
  "dry rice": "rice",
  "dry white rice": "rice",
  "long grain rice": "rice",
  "short grain rice": "rice",
  "red kidney beans": "kidney beans",
  "sweet corn": "sweetcorn",
  corn: "sweetcorn",
  "elbow macaroni": "macaroni",
  "penne pasta": "pasta",
  "pasta shells": "pasta",
  rotini: "pasta",
  fettuccine: "pasta",
  spaghetti: "pasta",
  penne: "pasta",
  rigatoni: "pasta",
  vermicelli: "vermicelli",
  "champignon mushrooms": "mushrooms",
  "button mushrooms": "mushrooms",
  "fresh mushrooms": "mushrooms",
  "garlic powder": "garlic powder",
  "corn tortillas": "corn tortilla",
  "flour tortillas": "flour tortilla",
  tortillas: "flour tortilla",
};
export function canonicalName(input: string) {
  const direct = aliases[input.toLowerCase().trim()];
  if (direct) return direct;
  let name = input
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[★*]/g, "")
    .replace(/bone-in,\s*skin-on/gi, "")
    .replace(/^\+\s*/, "")
    .replace(
      /(?:to taste|as needed|for serving|for the top crust|for garnish|for frying|for greasing|to grease|for dusting).*$/i,
      "",
    )
    .replace(/^[. ]+|[. ]+$/g, "")
    .replace(
      /\b(?:about|approximately|around|roughly|of|the|a|an|some)\b/g,
      " ",
    )
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;]/)[0]
    .replace(
      /\s+(?:cut into|with their|plus more|plus extra|more to taste|for the glaze|for glaze|for the sauce|for the dough|chilled|well stirred|divided|scalded|torn|pieces|julienned|stemless).*$/i,
      "",
    )
    .replace(
      /\b(?:large|medium-sized|medium sized|medium|small|fresh|dried|dry|finely|coarsely|chopped|minced|peeled|sliced|diced|cubed|grated|shredded|crushed|beaten|drained|rinsed|softened|melted|boneless|skinless|skin-on|thinly|thick|lightly|optional|sifted|ripe|very|thin|lean|quartered)\b/g,
      " ",
    )
    .replace(/\s+and\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  name =
    aliases[name] ??
    aliases[input.toLowerCase().trim()] ??
    ingredientName(name).toLowerCase();
  return name;
}
const seasonings =
  /^(?:salt|pepper|paprika|turmeric|cumin|coriander|ground coriander|parsley|basil|mint|rosemary|thyme|oregano|dill|cinnamon|nutmeg|chilli flakes|chilli powder|garlic powder|onion powder|chives|herbs|herbes de provence|bay leaf|saffron|spices|seasoning|white pepper|cayenne pepper|italian herbs|curry powder|fenugreek|garam masala)$/;
export function department(name: string) {
  if (/stock|broth|sauce|paste|powder|bouillon|béchamel/.test(name))
    return "Pantry & grains";
  if (
    /chicken|beef|pork|lamb|veal|bacon|ham|sausage|turkey|fish|salmon|tuna|prawn|shrimp|anchov|sardine|mackerel|crab|chorizo|guanciale|pancetta/.test(
      name,
    )
  )
    return "Meat & seafood";
  if (
    /egg|milk|cream|butter|cheese|yoghurt|parmesan|mozzarella|ricotta|scamorza|pecorino/.test(
      name,
    )
  )
    return "Dairy & eggs";
  if (
    /onion|carrot|tomato$|potato|capsicum|garlic|broccoli|spinach|cabbage|lettuce|zucchini|eggplant|celery|leek|ginger$|mushroom|cucumber|avocado|lemon|lime|orange|apple|banana|pear|fennel|beetroot|pumpkin|squash|spring onion|chilli$|parsley|coriander|basil|mint|dill/.test(
      name,
    )
  )
    return "Fruit & veg";
  return "Pantry & grains";
}
function estimated(
  name: string,
  kind: string,
  n: number,
  raw: string,
): Ingredient | undefined {
  const key = `${name}|${kind}`,
    rule = defaultEstimates[key];
  if (!rule) return;
  return {
    name,
    quantity: n * rule.quantity,
    unit: rule.unit,
    department: department(name),
    rawMeasure: raw,
    approximate: true,
    estimateKey: key,
    estimateMultiplier: n,
    measurementNote: `Configurable ${kind} estimate for ${name}; not an exact source weight.`,
  };
}
const amountPattern = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-–~]\s*\d+(?:\.\d+)?)?`;
const unitPattern = String.raw`(?:kilograms?|kg|grams?|gm|gr|g|milliliters?|millilitres?|ml|dl|cl|liters?|litres?|l|ounces?|oz|pounds?|lbs?|cups?|tablespoons?|tbsp|tblsp|tbs|teaspoons?|tsp|thumbs?|handfuls?|pinches|pinch|dash|splashes|splash|drizzles?|knobs?|quarts?|qts|pints?|pt|cans?|tins?|packets?|packs?|pcks|pkgs?|boxes|box|bunch(?:es)?|sprigs?|cloves?|heads?|bulbs?|stalks?|ribs?|rashers?|slices?|sticks?|cm|threads?|pieces?)`;
const physical: Record<string, [number, "g" | "ml"]> = {
  kg: [1000, "g"],
  kilogram: [1000, "g"],
  kilograms: [1000, "g"],
  g: [1, "g"],
  gram: [1, "g"],
  grams: [1, "g"],
  gm: [1, "g"],
  gr: [1, "g"],
  oz: [28.349523125, "g"],
  ounce: [28.349523125, "g"],
  ounces: [28.349523125, "g"],
  lb: [453.59237, "g"],
  lbs: [453.59237, "g"],
  pound: [453.59237, "g"],
  pounds: [453.59237, "g"],
  ml: [1, "ml"],
  milliliter: [1, "ml"],
  milliliters: [1, "ml"],
  millilitre: [1, "ml"],
  millilitres: [1, "ml"],
  dl: [100, "ml"],
  cl: [10, "ml"],
  l: [1000, "ml"],
  litre: [1000, "ml"],
  litres: [1000, "ml"],
  liter: [1000, "ml"],
  liters: [1000, "ml"],
};
export function parseSourceIngredient(
  original: string,
): Ingredient | undefined {
  const optional = /optional|if desired|to garnish|for garnish/i.test(original);
  let line = numericText(original.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))
    .replace(/⁄/g, "/")
    .replace(/\*+/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/^one\b/i, "1")
    .replace(/^two\b/i, "2")
    .replace(/^a\s+(?=bunch|pinch|handful|splash|knob)/i, "1 ")
    .replace(/(\d+)\s*-(\d+)\/(\d+)/g, "$1 $2/$3")
    .replace(/(\d+)\s+to\s+(\d+)/g, "$1-$2")
    .replace(/^(\d+)\s+(?:small|large|medium)\s+(?=bunch|clove)/i, "$1 ")
    .trim();
  // Explicit source package weights are multiplied by the package count.
  const packaged = line.match(
    /^(\d+)\s*(?:cans?|tins?|packets?)\s*\((\d+(?:\.\d+)?)\s*(oz\.?|ounces?|g|kg|ml|l)\)\s*/i,
  );
  if (packaged)
    line = `${Number(packaged[1]) * Number(packaged[2])} ${packaged[3].replace(/\.$/, "")} ${line.slice(packaged[0].length)}`;
  const paired = line.match(
    /^(\d+)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i,
  );
  if (paired)
    line = `${Number(paired[1]) * Number(paired[2])} ${paired[3]} ${line.slice(paired[0].length)}`;
  let quantity: number | undefined,
    kind = "each",
    approximate = false;
  // Use a source's parenthesised metric equivalent. It is a total, unless
  // explicitly stated as a per-item weight (which must be reviewed separately).
  const metric = line.match(
    new RegExp(
      String.raw`(?:\(|/|or |\|)\s*~?(${amountPattern})\s*(kg|grams?|gm|gr|g|ml|millilitres?|milliliters?|dl|cl|liters?|litres?|l)\b`,
      "i",
    ),
  );
  if (/\(1\s*~\s*\d+g\)/i.test(line)) return;
  if (metric) {
    const sourceAmount = metric[1].split(/[-–~]/).pop()!.trim();
    quantity = sourceNumber(sourceAmount);
    kind = metric[2].toLowerCase();
    approximate = /~|[-–]/.test(metric[0]);
    line = line.replace(/\([^)]*\)/g, " ").replace(metric[0], " ");
    line = line.replace(
      new RegExp(String.raw`^${amountPattern}\s*${unitPattern}\b[.]?`, "i"),
      " ",
    );
    // Two common source forms include a package/item count before the food.
    line = line.replace(/^\d+\s+/, "");
  } else {
    const quantified = line.match(
      new RegExp(String.raw`(${amountPattern})\s*(${unitPattern})\b[.]?`, "i"),
    );
    if (quantified) {
      const values = quantified[1].split(/[-–~]/);
      quantity = sourceNumber(values[values.length - 1]);
      approximate = values.length > 1;
      kind = quantified[2].toLowerCase();
      line = line.replace(quantified[0], " ");
    } else {
      const count =
        line.match(
          new RegExp(String.raw`^(${amountPattern})(?:\s+|(?=[a-z]))`, "i"),
        ) ??
        line.match(new RegExp(String.raw`\s(${amountPattern})(?:\s+|$)`, "i"));
      if (count) {
        const values = count[1].split(/[-–~]/);
        quantity = sourceNumber(values[values.length - 1]);
        approximate = values.length > 1;
        line = line.replace(count[0], " ");
      }
    }
  }
  line = line
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*of\s+/i, "")
    .replace(/^\s*cans?\s+/i, "")
    .trim();
  line = line.replace(/\([^)]*$/, " ").replace(/\)/g, " ");
  let name = canonicalName(line);
  const fruit = name.match(
    /(?:juice (?:of|from) )?(lemon|lime|orange|clementine)(?: juice| zest)?$/i,
  );
  if (
    kind === "each" &&
    quantity !== undefined &&
    fruit &&
    /juice|zest/i.test(original)
  )
    name = fruit[1];
  if (!name || /[0-9]|[()]/.test(name)) return;
  const base = {
    name,
    quantity: quantity ?? 0,
    unit: "each" as Ingredient["unit"],
    department: department(name),
    rawMeasure: original,
  };
  if (quantity === undefined) {
    const measure = /handful/i.test(original)
      ? "handful"
      : /pinch/i.test(original)
        ? "pinch"
        : /splash|drizzle/i.test(original)
          ? "splash"
          : /greas/i.test(original)
            ? "greasing"
            : /dust/i.test(original)
              ? "dusting"
              : undefined;
    if (measure)
      return estimated(
        name.replace(/^(?:handful|pinch|splash|drizzle)\s+(?:of\s+)?/i, ""),
        measure,
        1,
        original,
      );
    if (seasonings.test(name) || optional)
      return {
        ...base,
        quantity: 0,
        unit: "g",
        excludeFromShopping: true,
        estimateKey: `${name}|to taste`,
        estimateMultiplier: 1,
        measurementNote:
          "Unquantified source seasoning or optional garnish; excluded from exact totals.",
      };
    return;
  }
  const unit = physical[kind];
  if (unit)
    return {
      ...base,
      quantity: quantity * unit[0],
      unit: unit[1],
      approximate: approximate || undefined,
    };
  if (/^(?:tablespoon|tbsp|tblsp|tbs|teaspoon|tsp)/.test(kind)) {
    const spoon = /^(?:tsp|teaspoon)/.test(kind) ? "teaspoon" : "tablespoon";
    return (
      estimated(name, spoon, quantity, original) ?? {
        ...base,
        quantity: quantity * (spoon === "teaspoon" ? 5 : 15),
        unit: "ml",
        approximate: true,
        measurementNote:
          "Standard international recipe spoon estimate: 15 mL tablespoon / 5 mL teaspoon. Original wording retained; not an Australian 20 mL tablespoon.",
      }
    );
  }
  if (/clove/.test(kind))
    return name.includes("garlic")
      ? estimated("garlic clove", "each", quantity, original)
      : { ...base, name: "cloves", quantity };
  if (/head|bulb/.test(kind))
    return estimated(
      name.includes("garlic") ? "garlic bulb" : name,
      "each",
      quantity,
      original,
    );
  if (/stalk|rib/.test(kind))
    return estimated(name, "each", quantity, original) ?? { ...base, quantity };
  if (/rasher/.test(kind)) kind = "slice";
  else if (/can|tin/.test(kind)) kind = "can";
  else if (/pack|pkg|pck|box/.test(kind)) kind = "packet";
  else if (/quart|qts/.test(kind)) kind = "quart";
  else if (/pint|pt/.test(kind)) kind = "pint";
  else
    kind =
      (
        { pinches: "pinch", splashes: "splash", bunches: "bunch" } as Record<
          string,
          string
        >
      )[kind] ?? kind.replace(/s$/, "");
  if (kind !== "each") return estimated(name, kind, quantity, original);
  if (
    /\b(?:inch|cup|can|tin|bunch|packet|box|tbsp|tsp|ounce|oz|lb|grams?|ml|cm)\b/.test(
      name,
    )
  )
    return;
  return (
    estimated(name, "each", quantity, original) ?? {
      ...base,
      quantity,
      approximate: approximate || undefined,
    }
  );
}
export function metricDirections(text: string) {
  return text.replace(
    /\b(\d+(?:\.\d+)?)\s*(?:°|degrees\s*)?F\b/g,
    (_, n: string) => `${Math.round(((Number(n) - 32) * 5) / 9)}°C (${n}°F)`,
  );
}
export function curateSource(
  candidate: SourceCandidate,
  category: Category,
): Recipe {
  const decision: Decision =
    (decisions as Record<string, Decision>)[candidate.slug] ?? {};
  const review: string[] = [...(decision.review ?? [])];
  if (!Number.isInteger(candidate.servings) || candidate.servings < 1)
    review.push("Verify source yield.");
  const ingredients = [
    ...candidate.ingredients,
    ...(decision.extra ?? []),
  ].flatMap((line) => {
    if (decision.omit?.includes(line)) return [];
    if (/^(?:for (?:the|your) |.*:\s*$)/i.test(line)) return [];
    if (/\]\(\//.test(line) && /servings?/i.test(line)) {
      review.push(`Subrecipe must be resolved: ${line}`);
      return [];
    }
    if (
      /^salt and (?:freshly ground (?:black )?)?pepper(?: to taste)?[.]?$/i.test(
        line,
      )
    )
      return ["salt", "pepper"].map((name) => ({
        name,
        quantity: 0,
        unit: "g" as const,
        department: "Pantry & grains",
        rawMeasure: line,
        excludeFromShopping: true,
        estimateKey: `${name}|to taste`,
        estimateMultiplier: 1,
      }));
    const parsed = decision.parsing?.[line] ?? line;
    const ingredient = parseSourceIngredient(parsed);
    if (ingredient) {
      ingredient.rawMeasure = line;
      if (parsed !== line)
        ingredient.measurementNote = [
          ingredient.measurementNote,
          decision.notes ??
            "Source wording normalised; original wording retained.",
        ]
          .filter(Boolean)
          .join(" ");
      if (decision.approximateNames?.includes(ingredient.name))
        ingredient.approximate = true;
    }
    if (!ingredient) review.push(`Quantity requires review: ${line}`);
    return ingredient ? [ingredient] : [];
  });
  if (candidate.prep === null || candidate.cook === null)
    review.push("Verify preparation/cooking timing.");
  if (!candidate.instructions.length) review.push("Missing instructions.");
  const instructions = candidate.instructions.map(
    (s) => decision.instructionReplacements?.[s] ?? s,
  );
  const directions = instructions.join(" ").toLowerCase();
  if (instructions.some((s) => /\]\(\//.test(s)))
    review.push(
      "Directions rely on a linked subrecipe; resolve before planning.",
    );
  for (const name of ["salt", "pepper"])
    if (
      new RegExp(`\\b${name}\\b`).test(directions) &&
      !ingredients.some((i) => i.name.includes(name))
    )
      ingredients.push({
        name,
        quantity: 0,
        unit: "g",
        department: "Pantry & grains",
        rawMeasure: `${name} in source directions; no quantity supplied`,
        excludeFromShopping: true,
        estimateKey: `${name}|to taste`,
        estimateMultiplier: 1,
        measurementNote:
          "Source seasoning is unquantified; excluded from exact totals.",
      });
  // Infer only methods that are explicitly described. An oven is not an air fryer.
  const appliances: string[] = [];
  if (/\boven\b|\bbake\b|\broast\b/.test(directions)) appliances.push("Oven");
  if (
    /\b(?:pan|pot|skillet|stove|hob|saucepan|simmer|boil|fry|wok)\b/.test(
      directions,
    )
  )
    appliances.push("Hob");
  if (/\bblender\b/.test(directions)) appliances.push("Blender");
  if (/\bfood processor\b/.test(directions)) appliances.push("Food processor");
  if (/\bair fryer\b/.test(directions)) {
    appliances.push("Air fryer");
    const oven = appliances.indexOf("Oven");
    if (oven >= 0) appliances.splice(oven, 1);
  }
  if (/\bslow cooker\b|\bcrock ?pot\b/.test(directions))
    appliances.push("Slow cooker");
  if (/waffle maker/.test(directions)) {
    appliances.push("Waffle maker");
    if (!/\boven\b/.test(directions)) {
      const at = appliances.indexOf("Oven");
      if (at >= 0) appliances.splice(at, 1);
    }
  }
  if (/hand mixer|electric mixer|highest speed of your mixer/.test(directions))
    appliances.push("Hand mixer");

  const url = `https://github.com/ronaldl29/public-domain-recipes/blob/134e22f11e4d14e66ee587b1dd3a266e5646d387/content/${candidate.slug}.md`;
  // Both parts of four separated eggs require four whole eggs, not eight.
  const whites = ingredients.find(
      (i) => i.name === "egg white" && i.unit === "each",
    ),
    yolks = ingredients.find((i) => i.name === "egg yolk" && i.unit === "each");
  if (whites && yolks && whites.quantity === yolks.quantity) {
    whites.rawMeasure = `${yolks.rawMeasure}; ${whites.rawMeasure}`;
    whites.name = "egg";
    whites.measurementNote =
      "Separate these whole eggs and use both parts; counted once for shopping.";
    ingredients.splice(ingredients.indexOf(yolks), 1);
  }
  for (const i of ingredients)
    if (/^(?:egg white|egg yolk)$/.test(i.name) && i.unit === "each") {
      i.name = "egg";
      i.measurementNote =
        "Buy whole eggs and separate the parts specified by the source. Unused parts are not assumed consumed.";
    }
  const names = ingredients.map((i) => i.name).join(" ");
  const meat =
    /meat|prosciutto|duck|chicken|beef|pork|lamb|veal|bacon|ham\b|sausage|chorizo|turkey|guanciale|pancetta|fish|salmon|tuna|prawn|shrimp|anchov|sardine|mackerel|crab|oyster|gelatin|lard|worcestershire|dashi/.test(
      names,
    );
  const dairy =
    /milk|cream|butter|cheese|yoghurt|parmesan|mozzarella|ricotta|pecorino|scamorza|margarine/.test(
      names,
    );
  const diet: string[] = [];
  const uncertain =
    /curry paste|thai red|stock|broth|gelatine|worcestershire|dashi/.test(
      names,
    ) && !/vegetable stock/.test(names);
  if (!meat && !uncertain) diet.push("Vegetarian");
  if (!meat && !uncertain && !dairy && !/egg|honey/.test(names))
    diet.push("Vegan");
  if (!dairy) diet.push("Dairy-free");
  const image = candidate.photo
    ? `/recipe-photos/${candidate.slug}.webp`
    : undefined;
  return {
    id: `pdr-${candidate.slug}`,
    name: candidate.name,
    origin: "external",
    category,
    servings: candidate.servings,
    prep: candidate.prep ?? 0,
    cook: decision.cook ?? candidate.cook ?? 0,
    appliances: decision.appliances ?? appliances,
    wait: decision.wait,
    preparedIngredients: decision.preparedIngredients,
    diet,
    ingredients,
    instructions: instructions.map((s) =>
      metricDirections(s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")),
    ),
    emoji: "🍽️",
    colour: "#e7eedb",
    description: `Original yield: ${candidate.yieldLabel}. ${candidate.yieldLabel.includes("-") || candidate.yieldLabel.includes("–") ? "Uses the lower stated yield for generous portions. " : ""}Original contributor: ${candidate.author}. ${decision.notes ?? ""} Approximate conversions are labelled and configurable; unmeasured seasonings are excluded from exact totals.`,
    image,
    photo: image
      ? {
          url: image,
          author: candidate.author,
          license: "Public domain — Unlicense",
          sourceUrl: url,
          cacheAllowed: true,
        }
      : undefined,
    source: {
      name: `Public Domain Recipes · ${candidate.author}`,
      url,
      license: "Public domain — Unlicense",
      externalId: candidate.slug,
    },
    review: [...new Set(review)],
  };
}
