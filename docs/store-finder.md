# Australian store finder

## Sources and permitted use

The branch implements real on-demand database lookups, not a bundled example-store list or a saved-store text filter. **The latest failover patch is not yet live-verified or deployed.**

- [Photon by komoot](https://github.com/komoot/photon#demo-server) geocodes a user-submitted Australian suburb/postcode. Its public demo API permits reasonable project usage, with throttling and no availability guarantee. [API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md) describes the AU country filter, bounding box and GeoJSON result fields.
- Photon also offers documented nearby POI lookup at `/reverse`; results may be capped by the public server and are labelled as a potentially incomplete directory.
- VK Maps Overpass (`https://maps.mail.ru/osm/tools/overpass/api/interpreter`) is an independent fallback. The [OSM public instance directory](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances) publishes unrestricted project usage for that instance. Live Australian coverage and browser CORS have not been verified here.
- [Private.coffee Overpass](https://overpass.private.coffee/) retrieves named supermarket/convenience POIs within the chosen 30/50/100 km radius. Its published terms permit project/commercial access without registration, and require fair resource usage, privacy and OSM attribution. It is a community service without a service-level guarantee.
- Both use [OpenStreetMap data, licensed ODbL](https://www.openstreetmap.org/copyright). Attribution and original map-record links are displayed. OSM-derived records retain source URLs in JSON backups and are available under ODbL; the licence does not relicense unrelated household records.

No API key, location permission or backend is required for this household-scale public-service configuration. The browser sends the entered search text to Photon and an approximate search-centre coordinate/radius to Overpass. It omits credentials. It does not send household, pantry, recipe, purchase or budget records. Refer to the linked providers' privacy/usage terms. There is no autocomplete, background national download, repeated polling or same-endpoint automatic retry. A user-triggered lookup tries at most three independent sources sequentially: Photon nearby places, VK Maps Overpass, then Private.coffee. Each store request has a 12-second timeout, with at least 1.2 seconds between starts. Failed endpoints are skipped for at least five minutes, across app restarts using an optional localStorage health record; Retry-After can extend that interval, and HTTP 401/403 imposes at least 30 minutes. A successful source stops failover. Cancellation stops requests without penalising an endpoint. If some sources fail and others return empty, the app reports an incomplete search rather than claiming no nearby stores. A successful search is cached in IndexedDB and reused for seven days unless explicitly refreshed; saved stores remain usable offline indefinitely. The last entered postcode/suburb is also retained.

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

## Authorised test deployment and phone diagnostics

The owner authorised a private test deployment even though development-network restrictions prevent live API verification. No suitable browser-testing tool is available in this workspace. This does not establish real API availability or browser CORS compatibility.

Request errors identify **Photon postcode/suburb lookup** or **Overpass store lookup** and the host. HTTP failures include the status; busy services include the retry interval. A browser fetch failure is labelled a **network or browser-access error**, with CORS/security, connectivity and provider outage listed as possible causes, never as a confirmed diagnosis. Unreadable JSON and timeouts have separate messages. These errors appear in the finder alert; saved stores and household data are retained.

On Android, open the existing private HTTPS address in the same Chrome profile, search `4272` or `Tamborine Mountain QLD`, select a matching locality if prompted and tap a store. Check the Dashboard selector, reopen the app to check persistence, then try a different shopping week's store. If a search fails, report the exact on-screen error, entered query and whether it failed before or after locality selection. Do not clear site data to diagnose an API failure. No backend credentials or cloud-environment changes are required on the phone to try the public-service requests.


## Investigation following the Android Overpass failure

Confirmed application defect: a single Overpass endpoint and a 40-second request timeout with no automatic alternative source. The Android error occurs after geocoding, so it implicates the store lookup, not an empty saved-store list. The static Vite deployment makes these API calls from the phone; the development-cloud allowlist is not the phone's network policy. The existing service worker only intercepts same-origin resources, not these third-party requests. The Overpass POST uses a CORS-safelisted form content type, so it does not deliberately request a preflight; it still requires appropriate cross-origin response headers.

A separate web fetch of Private.coffee `/api/status` timed out. This is evidence of possible endpoint availability trouble, **not proof** of the Android root cause or a CORS diagnosis. Browser `TypeError` alone cannot distinguish CORS/security, DNS/TLS/network, or an upstream failure without response headers/browser diagnostics.

Alternative evaluation:

- VK Maps Overpass: globally indexed, public project-use policy, independent infrastructure. Added bounded automatic fallback, but live responses/CORS remain unverified.
- Photon nearby lookup: documented POI/tag/radius endpoint on the same provider whose geocoding worked on the phone. Added primary store lookup with capped-result disclosure. The maintainer [documents anti-abuse false positives for browser UA/referrer combinations](https://github.com/komoot/photon/discussions/1044); public demo service availability is not guaranteed. Do not spoof a browser/agent to evade these measures.
- Main `overpass-api.de`: current published policy excludes fast-deployed generated-app platforms, so deliberately not added. The Swiss endpoint covers Switzerland, not Australia; the old Kumi alias is not independent of Private.coffee.
- AllThePlaces and official retailer directories were investigated as a possible cached-directory route, but a permitted, current four-chain dataset could not be retrieved/tested here. No source records were invented or bundled as substitutes.

### Live verification outcome

`python scripts/check-store-directory.py --postcode 4272` was run in this workspace. It failed before any store lookup with **proxy CONNECT 403 Forbidden**, confirming a development-network restriction. Separate web-tool API requests were also inaccessible. No successful real 4272 store list, addresses, CORS headers or Android execution is claimed. The latest patch is held from deployment pending live verification, as requested. Automated synthetic-fixture tests are separate evidence for fallback/control logic, not live-source availability.

The diagnostic can be run once from an unrestricted computer using Python 3 and the same command. It prints the actual geocoder centre, source HTTP/CORS response headers and source-provided store names/addresses, checking coverage of the four chains. It preserves inherited proxies/TLS trust, stops on errors, and does not read or modify browser data. Even success there is not a substitute for Android cross-origin execution.

### Reliability route if public browser access remains unsuitable

A small **same-origin server-side route** on the existing Site would remove browser-to-provider CORS dependence. It should validate only an Australian location/radius (never accept arbitrary upstream URLs), use a truthful identifying application User-Agent, bound responses, cache locality lookups and directory results, apply per-provider cooldowns/Retry-After, rate-limit callers, and return structured provider failures. It must honour upstream refusals and must not bypass provider anti-abuse rules. It cannot fix provider outages or missing OSM address data by itself.

For dependable availability, use a maintained, appropriately licensed Australian store-directory snapshot or a contracted/self-hosted provider behind that route. Private credentials, if required, belong only in server environment secrets. A dated cached national directory would allow same-origin/offline proximity search without three external browser dependencies, but it needs a successfully retrieved, licensed dataset and an update/validation process. This patch does not silently convert the static site to an untested Worker or pretend a proxy/directory is configured.
