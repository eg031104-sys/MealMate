# Weekly serving count fix

Regeneration previously guessed that a saved meal was individually customised whenever its people/appetite values differed from the saved weekly preferences. A stale 2-person, 1× slot could therefore be retained during generation for a 4-person, 1.25× week and persisted with `portionOverride: true`. Individual swaps also retained the old slot values, while older generation entry points defaulted to global household settings. The recipe's original yield was not the cause: for example, the imported Shrimp Fettuccine Alfredo yields three standard servings.

Generation and replacement now share a portion resolver. Active weekly preferences are used unless the meal has an explicit override. Locked/cooked meals remain protected. Legacy operations without a saved weekly preference retain old unmarked slot values for compatibility. Saved plans are never repaired on load; merely opening an existing week changes nothing.

Old inferred override flags cannot safely be distinguished from genuine user overrides. The weekly replacement confirmation therefore offers an unchecked option: “Use weekly portions for all unlocked, uncooked meals (reset individual portion overrides)”. This explicitly clears overrides only on regenerated slots. Locked and cooked meals remain untouched. Leave it unchecked to keep intentional custom portions.

The existing original-yield calculation remains quantity × people × appetite ÷ recipe yield. Four people at 1.25× means five standard portions, not five times the source ingredient list. The same saved meal values drive recipe cards/details, shopping aggregation, pantry requirements, full purchase packs and budget estimates. Detail headings also follow edited values immediately.

Regression coverage includes 2/4/6 people, 1/1.25 appetite, all four meal categories, different source yields, the actual Alfredo recipe, stale saved slots, explicit and reset overrides, locks/cooked meals, purchases, pantry quantities, package/budget totals, swaps, and UI generation/manual editing/refresh persistence. No storage schema change, browser storage clearing or supermarket change is needed.
