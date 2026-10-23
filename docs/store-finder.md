# Australian store finder

## Sources and permitted use

This is a real on-demand database lookup, not a bundled example-store list or a saved-store text filter:

- [Photon by komoot](https://github.com/komoot/photon#demo-server) geocodes a user-submitted Australian suburb/postcode. Its public demo API permits reasonable project usage, with throttling and no availability guarantee. [API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md) describes the AU country filter, bounding box and GeoJSON result fields.
- [Private.coffee Overpass](https://overpass.private.coffee/) retrieves named supermarket/convenience POIs within the chosen 30/50/100 km radius. Its published terms permit project/commercial access without registration, and require fair resource usage, privacy and OSM attribution. It is a community service without a service-level guarantee.
- Both use [OpenStreetMap data, licensed ODbL](https://www.openstreetmap.org/copyright). Attribution and original map-record links are displayed. OSM-derived records retain source URLs in JSON backups and are available under ODbL; the licence does not relicense unrelated household records.

No API key, location permission or backend is required for this household-scale public-service configuration. The browser sends the entered search text to Photon and an approximate search-centre coordinate/radius to Overpass. It omits credentials. It does not send household, pantry, recipe, purchase or budget records. Refer to the linked providers' privacy/usage terms. There is no autocomplete, background national download, repeated polling or automatic retry. Requests are sequential, time-limited and spaced, with a 30-second back-off for busy services. A successful search is cached in IndexedDB and reused for seven days unless explicitly refreshed; saved stores remain usable offline indefinitely. The last entered postcode/suburb is also retained.

The public Nominatim and primary Overpass endpoints are deliberately not used: their current policies introduce extra restrictions for generated applications. Do not switch providers casually without checking the replacement's current terms.

## Behaviour and data quality

1. Dashboard / Planner / Supermarkets exposes **Find nearby supermarkets**, open automatically when no planning store is selected.
2. Submit a postcode such as `4272` or a suburb such as `Tamborine Mountain QLD`. Australian place/boundary results are validated; ambiguous locations require a tap to choose the search centre rather than silently choosing one.
3. Overpass returns actual mapped Coles, Woolworths, ALDI and IGA stores. Unsupported/fuel/closed tagged records and invalid coordinates are excluded. Matching mapped building/POI duplicates are suppressed.
4. Results are sorted by Haversine straight-line distance from the mapped place point, **not** from the phone or an exact street address, and **not** driving distance. A postcode can encompass several suburbs; choose the appropriate returned centre. Chain filtering needs no additional network request.
5. Store names/addresses are only read from source tags. Missing suburb/postcode/street data is explicitly unknown, never copied from the search location. A map link lets the user inspect the original record. Chains or branches missing from OSM cannot be guaranteed to appear. Confirm details with the retailer if accuracy is important.
6. Tapping a result saves/selects it as primary and as the **current week's** planning store. Existing explicit choices in other weeks, comparisons, product notes, purchases, plans and inventory remain unchanged. The existing selector immediately includes saved results.
7. Manual entry and official retailer locator links remain available if the source is incomplete or unavailable. Errors are not disguised as zero matches. Empty searches suggest changing location/radius without claiming the area has no stores.

**Locations are separate from product integration. No live retailer price, special, product range, opening-hour or stock feed is connected by this change.** Store choices still use explicit manual product/price notes and transparent partial estimates.

## Scaling / alternate providers

This deployment is for one household. For sustained/heavier use, obtain a suitable hosted geocoder/OSM provider or operate Photon and Overpass with appropriate Australian extracts, caching and monitoring. `StoreLocationProvider` isolates the two lookups; `locationEndpoints` names the configured public services. If a future provider requires a private API credential, implement a server-side authenticated proxy using server environment secrets; never put the key in a Vite variable or browser bundle. This patch does not provision such a provider or backend.

## Preservation and testing

The IndexedDB name, version (3), object store and household key are unchanged. New optional/defaulted finder metadata is an additive state migration; old V3 snapshots and old backups acquire empty search defaults. Existing V1/V2 migration backups remain. No database deletion/reset or browser-storage clearing is performed. Source coordinates and attribution are validated on backup restore.

Automated tests cover AU postcode/suburb validation, chain matching, radius/distance sorting, node/building handling, duplicates, missing address data, malformed/partial/busy responses, Dashboard selection, current-week overrides, ambiguous locations, cancellation, cached/offline results and persistence of existing purchases/pantry through the additive upgrade.

Live network verification must be recorded separately from mocked/fixture tests. The development workspace initially blocked `photon.komoot.io` and `overpass.private.coffee`; a successful production build alone does not prove network access or data coverage.
