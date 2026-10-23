# Genuine recipe and photograph provenance

The V3 source pack is intentionally small: **10 authentic external records, of which four are planning-ready and six need review**. It is not a replacement collection of hundreds. There are **nine matching source photographs**, including photographs for three of the four ready recipes. The slow-cooked beef recipe has no source photo and uses a neutral placeholder.

Source: [ronaldl29/public-domain-recipes](https://github.com/ronaldl29/public-domain-recipes), pinned to commit `134e22f11e4d14e66ee587b1dd3a266e5646d387`. Its [README licence statement](https://github.com/ronaldl29/public-domain-recipes#license) explicitly places the website and all text/images in the public domain; [LICENSE.md](https://github.com/ronaldl29/public-domain-recipes/blob/main/LICENSE.md) contains the Unlicense. Its image submission rules require pictures of the actual prepared dish, not unrelated stock images. Original recipe author credit is retained per record. The original source Markdown and licence are bundled under `public/recipe-sources/` for audit/offline reference.

## Planning-ready records

| Recipe | Original yield and timings | Normalisation/review choices |
| --- | --- | --- |
| Long-cooked Chuck Steak With Vegetables | 4; 15 min prep, 6 hours cooking | Original fresh-tomato option selected. Source explicitly provides 50 ml optional olive oil; that measured option is included. Slow cooker is required. No source photo exists. |
| Chocolate Chip Cookies | 4; 10 min prep, 10 min cooking | Original sugar ranges are 100–200 g each; the supplied lower bound of 100 g is selected and disclosed. Milk and vanilla stay in grams as the author specified: no mass/volume conversion. Original 375°F becomes 190.6°C. Matching photo retained. |
| Tarte Merengada de Limão | 20; 10 min prep, 20 min cooking | Original 1 dl lemon juice becomes 100 ml; one lemon for zest follows source step 4. No invented lemon-to-juice conversion. The original large serving yield is retained. Matching photo retained. |
| Oatmeal Pancakes | 8; 10 min prep, 15 min cooking plus stated batter rest | Source provides explicit gram/ml quantities. One teaspoon baking powder is represented as 5 ml, not grams. Optional jam omitted. The source's additional 15-minute rest is included in time filtering. Matching photo retained. |

Dietary labels on these records are conservative ingredient-derived labels, not allergen certifications. Packaged ingredients must be checked. Source cooking methods follow the actual instructions. These dishes have not been independently kitchen tested here. Original portions can be scaled; prepared leftovers are only matched to recipes explicitly declaring prepared ingredients.

## Review records

Shakshouka, Crab salad, Roesti, French Toast, Carbonara and Arroz Chaufa are authentic source records with matching photographs. Their ambiguous/unmeasured ingredients and/or serving/timing metadata have **not** been invented. They stay in the Review category and cannot supply automatic meal plans or shopping calculations until the household validates them.

## Legacy preservation

The 198 V2 mechanical variants are archived. The 30 unmodified, AI-authored initial MealMate starters are also marked as archived legacy AI records, rather than being counted as genuine external recipes. Saved IDs, ingredients, instructions, favourites and existing plan references remain intact; shopping calculations for already saved meals continue to work. Modified/user-created recipes are not discarded or overwritten. Archived records can be inspected with **Show archived recipes**. Normal discovery/generation and non-AI leftover matching exclude archived and AI records. Existing meals are retained when generation has no appropriate genuine replacement.

This deliberately reduces normal discovery to the reviewed genuine source set plus any eligible household-created/imported recipes. Limited breakfast/lunch/dinner breadth remains unfinished. In particular, the only shipped genuine main dish is a six-hour slow-cooker recipe, so normal short cooking-time preferences will exclude it. Import/review suitable recipes rather than silently falling back to AI-generated dinners. Existing plans are protected.

## Other researched/import sources

- [TheMealDB terms](https://www.themealdb.com/terms_of_use.php) and [API guide](https://www.themealdb.com/docs_api_guide.php): optional personal/development name search retained. Records get external attribution, photo metadata and a review flag. Missing yields, times and ambiguous measures are not filled by guesses. The live endpoint has not been exercised in this environment; remote images are not automatically cached.
- [Wikibooks copyrights](https://en.wikibooks.org/wiki/Wikibooks:Copyrights): reusable text can require attribution and share-alike; individual image licences need separate review. Investigated, no content bundled.
- [RecipeNLG terms](https://recipenlg.cs.put.poznan.pl/dataset): research/educational restrictions; not imported or redistributed.

## Images and offline operation

Only the exact source recipe photographs are used. The nine public-domain photographs were resized to at most 800×600 WebP, totalling roughly 260 KB, with attribution metadata retained. Cards load lazily; detail photos load eagerly. Missing/failed/unsafe image URLs use a neutral utensil placeholder. Local permitted photos and source snapshots are precached by the service worker and included in the cache-version hash. Remote/imported images are not downloaded or cached automatically merely because a record has a URL.
