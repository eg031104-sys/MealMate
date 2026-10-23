# MealMate V3

Upgrade of the existing Australian React + TypeScript + Vite household PWA. Existing recipes, plans, portions, locks, settings, purchases and pantry records remain in IndexedDB with migration/recovery copies. Work is on a separate review branch; no automatic GitHub merge.

## Run and check

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run format:check
npm run build
npm exec vite preview -- --host 0.0.0.0
```

Use HTTPS for Android installation/service workers. A LAN HTTP development URL is only a UI preview. Close other MealMate windows if prompted during the IndexedDB upgrade. Do not clear site data.

## V3 behaviour

- **Supermarket first:** save a specific Coles, Woolworths, ALDI or IGA branch; choose a primary store and optional per-week override/comparison stores. Search saved stores by suburb/postcode, with official locator links and explicit manual-store entry when no directory is connected.
- **Per-store products:** enter names/identifiers, compatible metric package sizes, optional prices and dated user availability reports. More than one product can supply an ingredient. V2 unscoped manual price records remain stored and can be explicitly copied to a chosen branch.
- **Store-aware planning:** requires a saved store before generation; evaluates full-basket package costs, existing stock/purchases, variation, exclusions and budget. Shared ingredients can avoid extra packs. Unknown prices produce a partial estimate. Existing meals with no suitable replacement are retained. It is a best-effort heuristic, not a guarantee of a complete, optimal or within-budget plan when source data is missing or fixed meals already exceed the limit.
- **Multi-store shopping:** optional basket comparisons and per-item saved-store assignments. Another-store choices can be used in the unavailable-item workflow. Recorded spending stays in the budget. Travel/convenience costs are not guessed.
- **Genuine catalogue:** four planning-ready external recipes plus six authentic records awaiting review; nine matching photographs. The old 198 mechanical variations and 30 unmodified AI-authored starter recipes are archived, not deleted. Existing saved references still scale and calculate shopping lists. User recipes/favourites are preserved. The normal catalogue is intentionally much smaller; genuine recipe breadth remains incomplete.
- **Real photographs:** matching source images on cards/details, fixed aspect ratios, lazy loading, author/licence credit, offline caching only for bundled permitted photographs, and graceful placeholders when no matching photo exists or loading fails.
- **Use Up Leftovers:** separate navigation section for surplus after selected-week reservations, raw/prepared separation, optional dates, eligible ingredient quantities, additional purchases, preparation time, add-to-plan approval and independent preparation. Independent cooking consumes unreserved stock and does not modify existing planned meals.
- **Food-safety boundaries:** expired/unknown quantities are not suggested. Prepared food needs storage/use-by dates and explicit prompt-refrigeration confirmation; a conservative three-day storage window applies. Raw meat, fish, eggs and milk products lacking use-by dates are excluded from leftover suggestions. Dates/confirmation are user inputs and cannot guarantee actual food safety. No raw/cooked interchange or mass/volume guess is made.
- **Household propagation:** stage people and appetite together, then press **Update all planned meals**. Confirmation shows counts and offers all/customised meals, defaults-only or Cancel. Recipes, locks, daily categories, purchases and other saved weeks remain unchanged; completed meals are not altered. Individual overrides are explicit and persist even if they happen to equal a later default.
- **Numeric editing:** draft-aware fields permit temporary emptiness and decimals where appropriate. Blur/Enter/Save validates. Empty/invalid edits keep previous valid data rather than restoring “1” on each keystroke. Clearing a budget is a separate explicit action. Quantities and prices are not silently turned into zero.

## What is genuinely connected?

**No Coles, Woolworths, ALDI or IGA live product/price/stock/directory feed is connected.** The working fallback is a local, per-branch manual catalogue. Production can label user-entered/estimated/unknown data and retains evidence fields for future authorised providers. It does not claim current verified prices or live stock. Manual availability reports expire after 24 hours. Price and availability provenance are separate.

Read [supermarket data investigation](docs/supermarket-data.md) for primary sources, access/licensing findings, auth/rate-limit unknowns, Open Prices/GS1 evaluation and what an authorised future integration needs. No fragile scraper, account bypass or client API secret was added.

The bundled source is [Public Domain Recipes](https://github.com/ronaldl29/public-domain-recipes), pinned and credited. TheMealDB's optional review-based importer remains available. See [recipe/image provenance](docs/recipe-sources.md) for exact yields, deliberate source-permitted choices, licence evidence, photographs and source limitations. These are **4 ready + 6 review** genuine recipes, not a claimed replacement library of hundreds. Most categories need more reviewed recipes; no AI dinners are substituted to hide that limit.

**No AI provider is configured.** Existing-library matching operates without a paid service. The snack-provider interface is gated behind zero matching existing recipes and a real configured provider; the UI explicitly disables generation when none exists. No key is accepted or stored in browser code.

## Architecture and preservation

V2 modules remain in place. `supermarkets.ts` / `v3-state.ts` add a validated store/provider abstraction and additive feature state. `household.ts` isolates serving propagation; `NumericInput` isolates draft editing. `catalogue.ts` / `genuine-recipes.ts` archive legacy entries without deleting IDs and add a pinned source pack without overwriting saved recipes. `RecipePhoto` handles photographs/fallbacks. `suggestions.ts` retains the non-AI provider, adds explicit prepared-pool rules and independent consumption. Existing `shopping.ts` still owns aggregate requirements, receipts, reservations, package estimates, substitutions, meal replacement and shopping change highlights.

IndexedDB schema version 3 uses the original `household` store and `state` key. First upgrade preserves `pre-v3-backup`; earlier migration and pre-restore snapshots remain. Backups accept older formats and V3, validate store/product relationships and recipe references, and preview before replacement. No purchase is automatically erased by a meal or serving change.

Reservations are for the selected week, as in V2, rather than a simultaneous global allocation over all saved future weeks. Opening stock and purchases are separate; do not enter the same purchase twice. Purchase records are only consumed on explicit cooking/preparation. Prepared stock is a separate ingredient pool and needs confirmed storage metadata before use. Image files are permitted local assets; imported remote photos remain optional online resources.

## Android acceptance checklist

1. Open the existing HTTPS MealMate address in Chrome while online. Close old MealMate windows if the database upgrade asks. Export a JSON backup in Settings; do not clear browser data.
2. Open **Supermarkets**. Add your exact branch using the official locator if needed, then select it as primary. Save another branch and test postcode search, a per-week override and optional comparison.
3. Enter a chicken product at 1,000 g/$12 for one branch and 500 g/$5 for another. For a saved recipe requiring 750 g, verify purchases round to 1,000 g and estimates differ by store. Labels must say user-entered; stock must remain unknown unless you record an observation.
4. Generate meals. Confirm a store is required, locked/custom daily settings remain and unmatched existing meals are kept. Review partial estimates and empty slots. The genuine starter collection is small; review/import additional suitable recipes before expecting a varied full week.
5. Browse Recipes: normal discovery excludes old AI/mechanical entries; **Show archived recipes** still finds old saved records/favourites. Check the real source photos, Review category and source credits. A broken/no-photo record must show a neutral placeholder.
6. In Settings, delete the people value, type a new one and edit appetite. Nothing should change in the plan until **Update all planned meals** and confirmation. Try defaults-only vs all/customised; verify quantities, pantry requirements, packages and budget update while purchases remain. Try an empty/negative numeric submission: previous valid data must survive.
7. Open **Use Up Leftovers**. Record/correct stock in Pantry. Check reserved versus surplus amounts. Add storage/use-by dates and refrigeration confirmation for prepared food. No safe match should produce an honest empty state and disabled unconfigured-AI option. A reviewed matching recipe can be added to the plan or explicitly recorded as independently prepared, consuming only unreserved eligible stock.
8. Retest V2 daily switches, manual meals, locks, individual portions, appliances, dietary restrictions, staples, compact shopping rows, purchases, unavailable-item replacements/substitutions, another-shop lists, highlights and JSON backup/restore.
9. Chrome → menu → **Add to Home screen → Install**. After an online load, close/reopen once to finish service-worker updates, then test flight mode. Local recipes, photos, plans and shopping should work; external imports/official locators need a connection.

Automated tests include DOM flows and fake IndexedDB migrations; they do not constitute physical Android installation, visual-browser or live retailer/API verification.
