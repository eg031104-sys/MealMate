# MealMate

React + TypeScript + Vite household meal planner. Australian English, metric ingredients, no API keys or backend required.

## Run

```sh
npm ci
npm run dev
npm test
npm run build
npm exec vite preview -- --host 0.0.0.0
```

For Android installation use the hosted HTTPS URL, then Chrome → menu → Add to Home screen → Install. A LAN HTTP development URL can preview the UI but cannot provide normal PWA installation or offline support. After the first online visit and service worker activation, the production app is available offline. Reopen after a new release to load its updated service worker.

## Architecture

- `src/domain.ts`: pure serving calculations, recipe matching, meal generation and shopping aggregation.
- `src/recipes.ts`: 30 original two-serving recipes and standardised ingredient records.
- `src/storage.ts`: versioned IndexedDB repository via `idb`; one atomic household snapshot.
- `src/main.tsx`: responsive dashboard, planner, recipe library, shopping checklist, pantry and settings.
- `scripts/service-worker.mjs`: build-time asset precache manifest and offline worker.
- `src/domain.test.ts`: serving and shopping regression tests, recipe integrity and planner constraints.

Settings, recipe records, seven-day plan, shopping ticks, pantry and week start persist in IndexedDB. The combined shopping list is derived from the persisted plan/settings so it cannot drift out of date. Ingredient names use canonical metric units; equal ingredient/unit/department keys merge. Fractional “each” quantities are intentional portion quantities, not retail pack sizes.

Generation is local and random, preferring unique meals until the matching pool is exhausted. Dietary, dislikes, time and appliance filters apply to generation, swaps and manual selection. Locked meals survive refreshes even when preferences change. Household defaults apply to new slots; individual meal portions remain independent. Disabled meal categories remain stored and are omitted from shopping. Changing the week date relabels the current plan; multiple-week history is not included.

## First-version limits

No supermarket prices, scraping, AI generation, authentication, cloud sync, custom recipe editor or nutrition analysis. Pantry is a checklist with shopping flags; stock quantities, expiry dates, automatic deductions and waste analytics are future work. Check allergy labels, particularly oats and packaged ingredients. Device/browser storage is not a backup and may be cleared by the browser or user.
