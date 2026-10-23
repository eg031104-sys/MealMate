import { useEffect, useRef, useState } from "react";
import type { State } from "../v2-state";
import { chains, type SearchPlace, type Store } from "../v3-state";
import { supermarketData } from "../supermarkets";
import {
  distanceKm,
  LOCATION_CACHE_MS,
  osmStoreProvider,
  saveFoundStore,
  type StoreLocationProvider,
} from "../store-finder";

type Props = {
  state: State;
  onChange: (state: State) => void;
  provider?: StoreLocationProvider;
};
export function StoreFinder({
  state,
  onChange,
  provider = osmStoreProvider,
}: Props) {
  const saved = supermarketData(state).storeFinder;
  const [query, setQuery] = useState(saved.query);
  const [radius, setRadius] = useState<30 | 50 | 100>(saved.radiusKm);
  const [chain, setChain] = useState("All chains");
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searched, setSearched] = useState(false);
  const active = useRef<AbortController | null>(null);
  const latest = useRef({ state, onChange });
  latest.current = { state, onChange };
  useEffect(() => () => active.current?.abort(), []);
  function updateFinder(patch: Partial<typeof saved>) {
    const { state: current, onChange: change } = latest.current;
    const data = supermarketData(current);
    change({
      ...current,
      v3: { ...data, storeFinder: { ...data.storeFinder, ...patch } },
    });
  }
  async function lookup(place?: SearchPlace, force = false) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError("");
    setNotice("");
    setSearched(false);
    if (!place) setPlaces([]);
    const clean = query.trim();
    if (
      !place &&
      (clean.length < 2 ||
        clean.length > 120 ||
        (/^\d+$/.test(clean) && !/^\d{4}$/.test(clean)))
    ) {
      setError("Enter an Australian suburb or a four-digit postcode.");
      return;
    }
    const current = supermarketData(latest.current.state).storeFinder;
    const cacheAge = Date.now() - Date.parse(current.fetchedAt ?? "");
    if (
      !force &&
      !place &&
      current.resultsQuery.toLowerCase() === clean.toLowerCase() &&
      current.location &&
      current.radiusKm === radius &&
      cacheAge >= 0 &&
      cacheAge < LOCATION_CACHE_MS
    ) {
      setNotice(
        "Showing your saved search. Refresh results to check the directory again.",
      );
      setSearched(true);
      return;
    }
    updateFinder({ query: clean });
    setBusy(
      place
        ? "Finding nearby supermarkets…"
        : "Finding your suburb or postcode…",
    );
    try {
      let location = place;
      if (!location) {
        const locations = await provider.locations(clean, controller.signal);
        if (controller.signal.aborted) return;
        if (!locations.length) {
          setNotice(
            "No matching Australian suburb or postcode found. Try adding the state, for example Tamborine Mountain QLD.",
          );
          return;
        }
        if (locations.length > 1) {
          setPlaces(locations);
          setNotice("Choose the location to search from.");
          return;
        }
        location = locations[0];
      }
      setPlaces([]);
      setBusy("Finding nearby supermarkets…");
      const results = await provider.stores(
        location,
        radius,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      updateFinder({
        query: clean,
        resultsQuery: clean,
        location,
        radiusKm: radius,
        results,
        fetchedAt: new Date().toISOString(),
      });
      setSearched(true);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          (e as Error).message || "Store search failed. Please try again.",
        );
    } finally {
      if (active.current === controller) setBusy("");
    }
  }
  const results = saved.results.filter(
    (s) => chain === "All chains" || s.chain === chain,
  );
  const old =
    !saved.fetchedAt ||
    Date.now() - Date.parse(saved.fetchedAt) > LOCATION_CACHE_MS;
  return (
    <section
      className="store-finder settings-card"
      aria-labelledby="store-finder-heading"
    >
      <h3 id="store-finder-heading">Find nearby supermarkets</h3>
      <p>
        Search Australian suburbs or postcodes. No location permission needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <label className="field">
          Australian postcode or suburb
          <input
            type="search"
            value={query}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="4272 or Tamborine Mountain QLD"
            autoComplete="postal-code"
          />
        </label>
        <div className="form-grid">
          <label>
            Search radius
            <select
              value={radius}
              onChange={(e) =>
                setRadius(Number(e.target.value) as typeof radius)
              }
            >
              {[30, 50, 100].map((k) => (
                <option key={k} value={k}>
                  {k} km
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter supermarket chain
            <select value={chain} onChange={(e) => setChain(e.target.value)}>
              {["All chains", ...chains].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button className="primary" type="submit" disabled={!!busy}>
            Search nearby stores
          </button>
          {saved.location && (
            <button
              className="secondary"
              type="button"
              disabled={!!busy}
              onClick={() => void lookup(undefined, true)}
            >
              Refresh results
            </button>
          )}
          {busy && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                active.current?.abort();
                setBusy("");
                setNotice("Search cancelled. Your saved stores are unchanged.");
              }}
            >
              Cancel search
            </button>
          )}
        </div>
      </form>
      {busy && (
        <p role="status" aria-live="polite">
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="finder-error">
          {error} You can still select a saved store or add one manually.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!!places.length && (
        <div
          className="finder-places"
          aria-label="Matching Australian locations"
        >
          {places.map((place) => (
            <button
              className="secondary"
              key={place.id}
              onClick={() => void lookup(place)}
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
      {saved.location && (
        <div className="finder-results" aria-busy={!!busy}>
          <p>
            <strong>Near {saved.location.label}</strong>
            <br />
            Within {saved.radiusKm} km · closest first · approximate
            straight-line distance from this mapped location, not driving
            distance.
          </p>
          <p className="subtle">
            {old
              ? "Older saved results — refresh when online."
              : `Directory retrieved ${new Date(saved.fetchedAt!).toLocaleDateString("en-AU")}.`}{" "}
            Community map details may be incomplete or out of date. Not a
            retailer-verified directory.
          </p>
          {results.map((store) => (
            <div key={store.id} className="finder-store">
              <button
                className="finder-store-select"
                type="button"
                disabled={!!busy}
                onClick={() => {
                  try {
                    const { state: current, onChange: change } = latest.current;
                    change(saveFoundStore(current, store));
                    setNotice(
                      `${store.name} saved as your primary supermarket and selected for week ${current.week}.`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <span className="finder-store-title">
                  <strong>{store.name}</strong>
                  <span>{store.chain}</span>
                </span>
                <span>
                  {store.address || "Address not supplied by OpenStreetMap"}
                </span>
                {!store.addressComplete && store.address && (
                  <span className="subtle">
                    Partial address · street details not supplied by source
                  </span>
                )}
                {!store.address && (
                  <span>
                    {[store.suburb, store.postcode].filter(Boolean).join(" ")}
                  </span>
                )}
                <span className="finder-distance">
                  {store.latitude !== undefined && store.longitude !== undefined
                    ? `${distanceKm(saved.location!, { latitude: store.latitude, longitude: store.longitude }).toFixed(1)} km away (approx.)`
                    : "Distance unavailable"}
                </span>
                <span className="finder-select-label">
                  {supermarketData(state).primary === store.id
                    ? "✓ Primary store · tap to use this week"
                    : "Save & select this store"}
                </span>
              </button>
              {store.sourceUrl && (
                <a
                  className="finder-source"
                  href={store.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View original map record ↗
                </a>
              )}
            </div>
          ))}
          {!results.length && !busy && (
            <p role="status">
              {chain === "All chains"
                ? "No mapped stores found within this radius. Try a wider radius or the manual fallback. This does not mean there are no supermarkets nearby."
                : `No ${chain} results in this search. Try another chain or a wider radius.`}
            </p>
          )}
        </div>
      )}
      {!saved.location && searched && !busy && (
        <p role="status">No stores found. Try another suburb or postcode.</p>
      )}
      <p className="subtle finder-attribution">
        Location data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors · ODbL
        </a>
        . Search uses{" "}
        <a
          href="https://github.com/komoot/photon"
          target="_blank"
          rel="noreferrer"
        >
          Photon
        </a>{" "}
        and{" "}
        <a
          href="https://overpass.private.coffee/"
          target="_blank"
          rel="noreferrer"
        >
          Private.coffee Overpass
        </a>
        . Your search text / approximate search centre is sent to these
        services. Store locations do not provide live prices, stock or
        opening-hour verification.
      </p>
    </section>
  );
}
