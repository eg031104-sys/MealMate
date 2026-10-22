# MealMate V2

Mobile-first React, TypeScript and Vite PWA for an Australian household. Core planning, shopping and inventory work locally without an account or paid API. This upgrades the existing MealMate app, keeping its original recipe IDs, plans, portions and local data.

## Run and verify

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm exec vite preview -- --host 0.0.0.0
```

Use HTTPS for Android installation and service workers. A LAN HTTP Vite URL is suitable for layout previews but is not a normal installable PWA origin.

## What's implemented

- Weekly category defaults plus date-specific daily switches, reset-to-defaults and preserved disabled meal slots. Tap a calendar date to open its settings.
- Per-meal people/appetite settings, recipe choice, swaps and locks; generation respects day overrides, dietary and ingredient exclusions, cooking times and appliances.
- Searchable grouped catalogue of 31 appliances and custom appliances. Legacy Hob/Oven selections remain valid. Only recipes with explicit alternative instructions offer another method; the original roast-side variations include conventional and fan-forced instructions.
- 228 offline recipes: the original 30 plus 198 original measured variations across porridge, grain/pulse bowls, stir-fries, vegetable sides, yoghurt snacks and soups. These are structured template variations, not 198 externally sourced or independently kitchen-tested dishes. Existing or user-created recipes are never overwritten by collection updates.
- Search by name/ingredients, category filtering including sides and review queue, time/favourite sorting, household matching, favourites and JSON recipe creation/editing.
- Optional TheMealDB personal/development search import, source attribution, recipe JSON batch import and duplicate detection. Imports with missing servings, ambiguous measures or incomplete metadata stay in review and cannot supply shopping ingredients. Metric conversion only accepts explicit supported quantities; source cups/spoons and “to taste” remain unresolved. Review quantities, serving sizes, tags, appliances and instructions before clearing review flags. External attribution is retained when editing TheMealDB records.
- Budgets per saved week, package-rounded purchase estimates, actual purchase prices, estimated plan-change differences and cheaper replacement browsing. Unknown prices or unresolved pantry checks produce a **partial estimate**. Demonstration prices and pack sizes are never labelled as live supermarket data. Product size, price and shop can be entered manually.
- Pantry staple choices and suggestions, aggregated “Check your pantry” quantities, sufficient-stock confirmation, transfer to the main shopping list, and manual stock estimates. A previous purchase is not treated as proof of indefinite availability.
- Compact shopping rows with a separate collected checkbox and expandable product, actual quantity, price, expiry and purchase controls. Actual purchase records survive plan changes; shortages name affected meals.
- Ledger-backed raw inventory, active-week reservations and surplus, explicit “Mark cooked & consume stock”, expiry exclusion, purchase corrections and prepared/raw separation. Weight and volume are never interchanged. A purchase with no expiry must be reconfirmed after 30 days; it is retained in history but stops counting as available.
- Unavailable-item menu: approve a verified ingredient substitution, approve replacement of only an affected meal (including explicit locked-meal approval), or keep outstanding requirements in another shop's list.
- New/increased/reduced/removed shopping changes, purchased indicators, changes-only filtering, explicit acknowledgement and new-session reset. Recorded purchases are never automatically removed.
- Local surplus snack/side/small-meal ranking using quantities left after reservations, expiry urgency, household portions and preferences. Adding an idea requires approval and updates the plan, reservations and shopping list.
- Versioned IndexedDB migration with pre-upgrade recovery snapshot; schema-validated JSON backup export/restore with preview and pre-restore recovery snapshot. Failed loading does not overwrite original data and offers a raw recovery download.
- Offline app shell and local collection, cached assets, and navigation fallback after three seconds of unavailable network.

## Inventory and budget rules

Ingredient identity is canonical name plus metric unit; aisle/department is display metadata. V1 department-based shopping tick keys migrate to the new identity. Different units remain separate unless an explicit same-dimension conversion is available.

Opening stock and purchase lots are separate. Correct **opening stock** without including recorded purchases again. Correct a receipt to change its purchased quantity; do not record the same purchase twice. Purchases initially have zero consumed quantity. Available raw stock is total usable stock less consumption; reservation is the smaller of on-hand stock and uncooked recipe requirements. Surplus is on-hand stock less that reservation. Explicit cooking consumes quantified stock once and releases that meal's reservation. Unknown pantry estimates can confirm shopping sufficiency but are not invented as numeric inventory; enter a measured stock quantity before automatic consumption.

Reservations are calculated for the **selected week**, not a simultaneous global allocation over every saved week. Check the relevant week before shopping or cooking. Changing the selected week retains plans, budgets, checks and purchase history. Overlapping future weeks can therefore display the same on-hand inventory until cooking is recorded. This is an explicit current limitation.

Budget totals include all recorded purchases in that week, even if their original meal is removed, plus outstanding rounded package purchases. Entered actual prices override estimates. Pantry items awaiting a quantity check are excluded and make the total partial; missing product prices also make it partial. Unknown prices are never silently treated as known zero-cost items. Costs are shopping purchase costs, not nutrition or ingredient-consumption valuations.

## Architecture

- `src/domain.ts`: existing recipe/meal/settings types, pure serving and aggregation functions; optional metadata and cooking methods extend the V1 model.
- `src/v2-state.ts`: schema validation, additive feature state, migration and backup checks, per-date overrides and saved-week switching.
- `src/storage.ts`: original household store retained in IndexedDB v2; atomic migration/recovery and restore transactions.
- `src/appliances.ts`: grouped catalogue and explicitly supported equivalent equipment.
- `src/shopping.ts`: inventory ledger projections, package recommendations, budgets, generation ranking, replacements/substitutions, changes and explicit consumption.
- `src/recipe-import.ts`: extensible recipe-source interface, TheMealDB adapter, measure parsing, validation and deduplication.
- `src/collection.ts`: measured original recipe variations added without replacing saved recipes.
- `src/suggestions.ts`: replaceable suggestion-provider interface and functional local-library provider. No AI provider or API keys are configured.
- `src/components/`: modular shopping, pantry, appliance, recipe-library and backup interfaces; existing dashboard/planner retained in `main.tsx`.
- `scripts/service-worker.mjs`: production precache and offline worker generation.

Tests cover V1 calculations, daily defaults/overrides, pantry classification/aggregation, package pricing, shortages/surplus, reservations/consumption, locked replacements, substitutions, other-shop handling, shopping changes, source review/deduplication, backup rejection and IndexedDB migration/restore. DOM integration tests exercise real navigation, daily switches, purchase recording, reopening, appliance search, recipe filtering and invalid backup rejection. They are not physical Android or browser-rendering tests.

## Recipe-source investigation

- [TheMealDB terms](https://www.themealdb.com/terms_of_use.php) permit personal/development API use and require retaining notices; app-store/commercial distribution has additional conditions. [API guide](https://www.themealdb.com/docs_api_guide.php) documents the free test endpoint. MealMate uses an optional personal/development name-search adapter, not website scraping or a bundled bulk dump. Network access is needed only when importing. Most source records require manual completion; the app does not invent servings or unresolved measurements.
- [Wikibooks licensing](https://en.wikibooks.org/wiki/Wikibooks:Copyrights) offers reusable text with attribution/share-alike obligations. No Wikibooks content or images are bundled in this version; a future adapter needs per-source licence/attribution and reliable measurement review.
- [RecipeNLG dataset terms](https://recipenlg.cs.put.poznan.pl/dataset) restrict use to non-commercial research/education. It is not imported or redistributed here.

## Current limits

No real supermarket catalogue/pricing, product-level alternatives, scraping, AI generation, cloud sync or account system. Verified ingredient substitutions currently cover only spinach→baby spinach, carrot→purple carrot, onion→brown onion and lemon→lime. Other shortages can use meal replacement or another-shop handling.

Prepared purchases/opening stock and expiry dates can be recorded, but prepared-leftover recipes and prepared-stock consumption suggestions remain unfinished. Prepared food is deliberately excluded from raw-ingredient reservations and local suggestions. Perishable safety depends on correct user-entered dates and storage; expiry dates are not safety guarantees. Ingredient exclusions are name based and dietary tags require trustworthy recipes and label checks; cross-contamination cannot be detected.

The recipe editor is a validated JSON editor, not a full ingredient form. The optional TheMealDB browser import has unit/adapter tests but has not been exercised against the live service in this environment. Remote source images may be unavailable offline. The core local library and saved data remain usable offline. Automated checks do not replace a real Android installation/offline check.

## Android acceptance check

1. Open the existing MealMate HTTPS address in Chrome. On the first V2 load, close other MealMate tabs/windows if prompted so the database upgrade can finish. Do not clear site data. Export a JSON backup in Settings.
2. Choose **Dinner** as the weekly default. Tap Wednesday and enable Lunch. Check Tuesday/Thursday still have only Dinner; refresh and recheck Wednesday. Reset Wednesday to defaults and verify its saved recipe/portions were kept.
3. Search the appliance settings, select your equipment, then refresh unlocked meals. Locks remain in place. Test a recipe's displayed compatible method.
4. In Shopping List, set a weekly budget. Inspect example pack labels. Enter your own package price if desired. Confirm pantry staples or send them to shopping.
5. Expand an ingredient. Record a larger actual purchase and optional price/use-by date. Check reserved/surplus quantities in Pantry. Record a smaller purchase for another ingredient and check its shortage/affected meals.
6. Use “Shop doesn't have this item”. Preview a replacement, approve it and inspect blue/grey changes. Confirm unrelated meals and recorded purchases remain. Test another-shop grouping and changes-only mode.
7. Review a surplus idea, select people/day and approve adding it. Check changed reservations. Explicit cooking should consume stock only once and refuse unknown/insufficient inventory.
8. Export a backup. Restore a valid file only after checking its preview; a malformed file must be rejected without changing data.
9. Chrome → menu → **Add to Home screen → Install**. Close all MealMate tabs and reopen after an update. After one successful online load, enable flight mode and reopen. Planning, recipes, shopping and saved data should work; new external imports will need a connection.
