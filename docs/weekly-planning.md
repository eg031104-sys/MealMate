# Weekly planning, recipe rotation and My Meals

This upgrade extends the existing React/Vite/IndexedDB app and its V3 branch. The genuine recipe catalogue and supermarket finder providers are unchanged. No browser database, object store or local-storage key is deleted or reset. The deployed origin remains the existing owner-private site.

## Weekly preferences

**Plan My Meals** opens eight collapsible preference sections before generation: people, appetite, dietary requirements/additional allergen exclusions, appliances, total preparation/cooking/stated waiting time, breakfast/lunch/dinner/snack categories, saved supermarket/store and AUD weekly budget. Numeric drafts can be temporarily empty. Invalid values are rejected on Generate, retaining saved data.

The selected week's preferences and the last successfully generated preferences are stored in the additive `planning` state field. Weeks with no saved preferences initialise from the last-used preferences, or household defaults. Store selection respects an existing explicit week store; household primary store and other week assignments are retained. Budgets use the existing week-budget model. New settings do not overwrite global household defaults. The existing **Update all planned meals** action still explicitly saves household defaults and updates the selected week's portions after its confirmation choice.

Daily category overrides take precedence over weekly defaults, including disabled days. Existing disabled meal records stay stored. New generation respects explicit custom portions and preserves locked/cooked meals and their portions. Existing unlocked plans require explicit replacement confirmation. Monday-based week selection gives fixed weekdays their expected calendar meaning; existing non-Monday legacy plans remain stored and require choosing a Monday before using the new generator.

The existing finder is reused inside the supermarket section; no new supermarket catalogue integration is introduced. It can still be used through Dashboard and Supermarkets, and manual entry remains available.

## Generation and rotation

1. Reserve eligible fixed-weekday recipes in their own meal category.
2. Assign weekly random-day recipes to free slots in the appropriate category.
3. Fill remaining enabled slots with eligible library recipes, preferring unused recipes before repeating.

Dietary tags, ingredient dislikes, available documented appliance methods, maximum stated time, household allergen exclusions, additional weekly exclusions and supplied recipe allergen metadata are checked. Household allergens cannot be relaxed through weekly preferences. Imported or packaged foods can have unlisted allergens; packaging still needs checking. Locked recipes which no longer meet filters are retained with a warning, rather than silently replaced.

A dinner cooldown prefers recipes not planned or explicitly confirmed cooked during the preceding 21 days, using saved week dates and actual confirmed cooking dates where present. Cooldown is evaluated for each target day. Undated old `recent` IDs cannot establish a 21-day date and are not given fabricated timestamps. When there are too few eligible recipes, relax cooldown first, then allow within-week duplication if unavoidable; show these limitations. Never relax hard dietary/allergy/appliance/time filters to fill a blank.

The heart and adjacent dropdown are independent. Hearts immediately toggle favourites; normal favourites receive a 3:1 sampling boost before cost adjustment, rather than mandatory inclusion or permission to duplicate. Weekly repeat choices explicitly request a slot even during cooldown. Normal rotation clears the repeat preference without clearing the favourite. A fixed weekday uses Monday–Sunday indices and the recipe's own meal category. Conflicting fixed recipes, disabled/locked slots, too many random repeats or ineligible weekly recipes stop generation without replacing the plan. The error includes the affected recipes' scheduling controls so the user can change a weekday/rotation and retry.

The generator reuses existing full-package shopping/budget calculations and user-reported unavailable product handling. It prefers choices within the entered estimate where possible and warns when the final estimate exceeds the budget or is partial. This is a heuristic; it does not guarantee an optimal or genuinely within-budget basket with missing prices or unavoidable scheduled meals. No live pricing, stock or new API provider is claimed.

## My Meals and inventory

**History** distinguishes planned/unconfirmed meals from confirmed cooking. Passing a planned date never marks anything cooked. Users confirm an actual date, correct it, or remove the cooking confirmation. Future or invalid actual dates are rejected. Correcting a date leaves inventory quantities intact.

- **Confirm cooked** in My Meals records history and releases the meal reservation, without consuming pantry stock. This is labelled explicitly and works without a complete inventory.
- **Mark cooked & consume stock** in the planner retains the existing stock-availability check and consumes quantified lots, then records dated history and exact purchase/stock consumption deltas.
- Removing a new inventory-backed confirmation can restore just that entry's recorded consumption. Purchases themselves are retained. If referenced inventory lots have since changed or been removed, the app refuses an unsafe automatic restoration; users can correct Pantry or explicitly remove the confirmation without changing stock.
- Older cooked flags have no verified actual date or per-meal consumption ledger. They appear as previously marked cooked, actual date not recorded, with their planned date clearly identified. Corrections/removal do not invent or reverse unknown consumption.
- Existing independently prepared leftover meals appear as confirmed independent meals. They predate the new per-meal ledger; editing/removing these history records leaves inventory unchanged, with this limitation shown in the editor.

The Favourites tab includes all favourited records, including archived records (clearly labelled and excluded from normal automatic generation). Hearts, repeat controls and recipe opening work there and throughout the recipe library, planner, chooser, details, history and leftover suggestions. Removing a favourite does not erase its repeat preference or history.

## Persistence and compatibility

The existing database remains `mealmate`, version **3**, store `household`, key `state`. New validated fields are optional/additive (`planning` and recipe `repeat`). Legacy V1/V2/V3 snapshots without them still load. New preferences, confirmations, repeat rules and consumption ledgers participate in existing JSON backup/export and validation; duplicate history IDs and missing history recipe references are rejected on restore. Restoring a new backup into an older app cannot make that older app understand the new features; use the updated app for full fidelity.

Stock, purchases, pantry decisions, shopping checkmarks/change baselines, source recipes, favourites, manually edited recipes, archived references, per-meal quantities, daily overrides, saved stores and other weeks remain stored. Shopping/pantry/leftover reservations continue to derive from active, uncooked meals and their actual per-meal portions. No new reservation double-counting is introduced.

## Verification and Android acceptance

Automated coverage includes preference isolation/last-used values, all meal categories, four people at 1.5 appetite, aggregation, strict filters, cooldown/fallback, favourite weighting, fixed/random repeats, actionable conflicts, locks/custom portions, swaps, cooked confirmation/correction/removal, consumption restoration, old-data migration, backup and fake IndexedDB reload. The previous recipe/source/photo and supermarket finder/selector suites still run.

Open the existing private HTTPS site online, close all MealMate windows and reopen once to let the service worker update. Do **not** clear site storage or uninstall as an update method. In an unused week:

1. Press **Plan My Meals**, inspect each section, choose a saved store, set people/appetite and generate. Check calendar quantities and Shopping List. Reopen the app and confirm those weekly preferences and store persist while Settings retains household defaults.
2. Heart a recipe; use the arrow to select a weekly weekday or random day. Generate another week and inspect placement. Schedule two dinners on one weekday to check conflict resolution.
3. In My Meals → History confirm an actual cooking date, correct it and remove a mistaken confirmation. Verify merely planned past meals remain unconfirmed. Check Favourites and its independent repeat controls.
4. Try regenerating an existing week and cancel replacement. Check locked/cooked meals and customised portions survive a confirmed regeneration.
5. Verify pantry, shopping purchases, another-store assignments, backup and offline use remain available.

Physical Android rendering/installation and external store-provider availability cannot be established by DOM tests. The available workspace has no supported browser QA runtime; publication still uses a verified production build and owner-private deployment.
