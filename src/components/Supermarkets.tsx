import { useState } from "react";
import { StoreFinder } from "./StoreFinder";
import type { State } from "../v2-state";
import type { Store } from "../v3-state";
import { chains, storeSchema } from "../v3-state";
import {
  selectedStore,
  supermarketData,
  findSavedStores,
  priceStatus,
  availabilityLabel,
  saveStoreProduct,
} from "../supermarkets";
import { budget, requirements, aud } from "../shopping";
import { itemKey } from "../v2-state";
import { parseNumberDraft } from "../numeric";
const locators: Record<string, string> = {
  Coles: "https://www.coles.com.au/find-stores",
  Woolworths: "https://www.woolworths.com.au/shop/storelocator",
  ALDI: "https://www.aldi.com.au/stores/",
  IGA: "https://www.iga.com.au/stores/",
};
type Props = { state: State; onChange: (s: State) => void };
export function StoreSelector({
  state,
  onChange,
  compact = false,
}: Props & { compact?: boolean }) {
  const data = supermarketData(state);
  const current = selectedStore(state);
  const [finderOpen, setFinderOpen] = useState(!current);
  return (
    <section className="store-selector">
      <div>
        <span className="eyebrow">SHOP FIRST, PLAN SECOND</span>
        <h2>
          {current
            ? `${current.chain} · ${current.name}`
            : "Choose your supermarket & store"}
        </h2>
        <p>
          {current
            ? `${current.suburb} ${current.postcode} · manual local catalogue. Live prices and stock are not connected.`
            : "Find and save a nearby supermarket before generating a meal plan. Existing meals and purchases are preserved."}
        </p>
      </div>
      <label>
        Planning store · week {state.week}
        <select
          aria-label="Planning store"
          value={data.weekStores[state.week] ?? ""}
          onChange={(e) => {
            const weeks = { ...data.weekStores };
            if (e.target.value) weeks[state.week] = e.target.value;
            else delete weeks[state.week];
            onChange({ ...state, v3: { ...data, weekStores: weeks } });
          }}
        >
          <option value="">
            {data.primary ? "Use primary store" : "Select a saved store"}
          </option>
          {data.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.chain} — {s.name}, {s.suburb} {s.postcode}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary" onClick={() => setFinderOpen(!finderOpen)}>
        {finderOpen ? "Hide store finder" : "Find nearby supermarkets"}
      </button>
      {finderOpen && <StoreFinder state={state} onChange={onChange} />}
      {!compact && (
        <p className="subtle">
          Store selection changes estimates and generation preferences, not
          existing meal selections. Product ranges and availability are unknown
          until supplied. Manual observations are never described as verified
          stock.
        </p>
      )}
    </section>
  );
}
export function Supermarkets({ state, onChange }: Props) {
  const data = supermarketData(state);
  const [chain, setChain] = useState<Store["chain"]>("Coles");
  const [name, setName] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <StoreSelector state={state} onChange={onChange} />
      <section className="settings-card">
        <h2>Your preferred stores</h2>
        <label className="field">
          Search saved stores by suburb or postcode
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suburb, postcode or store name"
          />
        </label>
        {findSavedStores(data.stores, query).map((s) => (
          <div className="saved-store" key={s.id}>
            <strong>
              {s.chain} — {s.name}
            </strong>
            <p>
              {s.address} · {s.suburb} {s.postcode}
              <br />
              {s.origin === "openstreetmap" ? (
                <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                  OpenStreetMap contributors · ODbL · community directory
                </a>
              ) : (
                "User-entered store details"
              )}
            </p>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() =>
                  onChange({ ...state, v3: { ...data, primary: s.id } })
                }
              >
                {data.primary === s.id ? "✓ Primary store" : "Make primary"}
              </button>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={data.comparisonStores.includes(s.id)}
                  onChange={(e) =>
                    onChange({
                      ...state,
                      v3: {
                        ...data,
                        comparisonStores: e.target.checked
                          ? [...data.comparisonStores, s.id]
                          : data.comparisonStores.filter((id) => id !== s.id),
                      },
                    })
                  }
                />
                Include in comparison
              </label>
            </div>
          </div>
        ))}
        {!findSavedStores(data.stores, query).length && (
          <p>
            No matching saved stores. Search nearby supermarkets above, or add a
            location manually below.
          </p>
        )}
        <h3>Add a specific store</h3>
        <p>
          Manual fallback: use the official locator if the community directory
          has missing or outdated details, then save the exact branch here.
        </p>
        <div className="form-grid">
          <label>
            Supermarket chain
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value as Store["chain"])}
            >
              {chains.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Store name / location
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Exact branch name"
            />
          </label>
          <label>
            Suburb
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} />
          </label>
          <label>
            Postcode
            <input
              inputMode="numeric"
              maxLength={4}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
            />
          </label>
          <label className="full-width">
            Street address (optional)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        </div>
        <div className="button-row">
          <a href={locators[chain]} target="_blank" rel="noreferrer">
            Find a location on {chain}’s official website ↗
          </a>
          <button
            className="primary"
            onClick={() => {
              try {
                const store = storeSchema.parse({
                  id: crypto.randomUUID(),
                  chain,
                  name: name.trim(),
                  suburb: suburb.trim(),
                  postcode,
                  address,
                  origin: "user",
                });
                if (store.name.toLowerCase() === chain.toLowerCase())
                  throw Error(
                    "Enter a specific branch name, not only the chain.",
                  );
                if (
                  data.stores.some(
                    (s) =>
                      s.chain === store.chain &&
                      s.postcode === store.postcode &&
                      s.name.toLowerCase() === store.name.toLowerCase(),
                  )
                )
                  throw Error("This store is already saved.");
                onChange({
                  ...state,
                  v3: {
                    ...data,
                    stores: [...data.stores, store],
                    primary: data.primary ?? store.id,
                  },
                });
                setName("");
                setMessage(
                  "Store saved. Add product package sizes and prices to improve planning.",
                );
              } catch (error) {
                setMessage("Store not saved: " + (error as Error).message);
              }
            }}
          >
            Save store
          </button>
        </div>
        <p role="status">{message}</p>
      </section>
      <StoreCatalogue state={state} onChange={onChange} />
      <StoreComparisons state={state} />
    </>
  );
}
export function StoreCatalogue({ state, onChange }: Props) {
  const data = supermarketData(state);
  const current = selectedStore(state);
  const [ingredient, setIngredient] = useState("");
  const [unit, setUnit] = useState<"g" | "ml" | "each">("g");
  const [product, setProduct] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [availability, setAvailability] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown");
  const [message, setMessage] = useState("");
  if (!current) return null;
  return (
    <section className="settings-card catalogue">
      <h2>{current.name} · product notes</h2>
      <p>
        User-entered prices and pack sizes only. Availability is a dated user
        report; no retailer has verified it. Enter one or more products per
        ingredient to compare whole-package costs.
      </p>
      {Object.values(state.v2.products).some((p) => p.source === "user") && (
        <details className="legacy-products">
          <summary>Recover V2 manual prices for this store</summary>
          <p>
            These older prices were not attached to a specific store. Copy only
            when you confirm they belong to {current.name}; dates and
            availability remain unknown.
          </p>
          {Object.entries(state.v2.products)
            .filter(([, p]) => p.source === "user")
            .map(([key, p]) => (
              <button
                className="secondary"
                key={key}
                onClick={() => {
                  try {
                    const unit = key.split("|")[1];
                    if (!["g", "ml", "each"].includes(unit))
                      throw Error("Unit requires review");
                    onChange(
                      saveStoreProduct(state, {
                        id: `legacy/${current.id}/${key}`,
                        storeId: current.id,
                        ingredientKey: key,
                        name: p.name || key.split("|")[0],
                        unit,
                        size: p.size,
                        price: p.price,
                        source: "user",
                        availability: "unknown",
                      }),
                    );
                    setMessage(
                      "Legacy manual price copied to this store. Confirm the price is still useful.",
                    );
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                Copy {p.name ?? key.split("|")[0]} ·{" "}
                {p.price === undefined ? "Unknown price" : aud(p.price)}
              </button>
            ))}
        </details>
      )}
      <datalist id="ingredient-names">
        {[
          ...new Set(
            state.recipes.flatMap((r) => r.ingredients.map((i) => i.name)),
          ),
        ]
          .sort()
          .map((n) => (
            <option key={n}>{n}</option>
          ))}
      </datalist>
      <div className="form-grid">
        <label>
          Recipe ingredient
          <input
            list="ingredient-names"
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
            placeholder="e.g. Chicken breast"
          />
        </label>
        <label>
          Unit
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            {["g", "ml", "each"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Product name / identifier
          <input value={product} onChange={(e) => setProduct(e.target.value)} />
        </label>
        <label>
          Package size ({unit})
          <input
            type="number"
            min="0.001"
            step="any"
            value={size}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setSize(e.target.value)}
          />
        </label>
        <label>
          Package price (AUD, optional)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Observed availability
          <select
            value={availability}
            onChange={(e) =>
              setAvailability(e.target.value as typeof availability)
            }
          >
            <option value="unknown">Unknown</option>
            <option value="available">I saw it available</option>
            <option value="unavailable">I saw it unavailable</option>
          </select>
        </label>
      </div>
      <button
        className="primary"
        onClick={() => {
          try {
            const qty = parseNumberDraft(size, 0.001),
              cost = price.trim() === "" ? undefined : parseNumberDraft(price);
            if (
              qty === undefined ||
              (price.trim() !== "" && cost === undefined)
            )
              throw Error("Enter a positive pack size and valid price.");
            if (!ingredient.trim())
              throw Error("Choose the ingredient this product supplies.");
            const now = new Date().toISOString();
            onChange(
              saveStoreProduct(state, {
                id: crypto.randomUUID(),
                storeId: current.id,
                ingredientKey: itemKey({
                  name: ingredient,
                  unit,
                  quantity: 1,
                  department: "Pantry",
                }),
                name: product.trim() || ingredient.trim(),
                unit,
                size: qty,
                price: cost,
                source: "user",
                observedAt: now,
                availability,
                availabilitySource: "user",
                availabilityAt: now,
              }),
            );
            setMessage("Product saved for this store only.");
            setSize("");
            setPrice("");
          } catch (error) {
            setMessage((error as Error).message);
          }
        }}
      >
        Save store product
      </button>
      <p role="status">{message}</p>
      {data.products
        .filter((p) => p.storeId === current.id)
        .map((p) => (
          <details className="catalogue-product" key={p.id}>
            <summary>
              <strong>{p.name}</strong>
              <small>
                {p.size} {p.unit} ·{" "}
                {p.price === undefined ? "Unknown price" : aud(p.price)} ·{" "}
                {priceStatus(p)}
              </small>
            </summary>
            <p>
              {availabilityLabel(p)} ·{" "}
              {p.observedAt
                ? new Date(p.observedAt).toLocaleDateString("en-AU")
                : "Undated"}
              <br />
              Ingredient key: {p.ingredientKey}
            </p>
            <button
              className="secondary"
              onClick={() =>
                onChange({
                  ...state,
                  v3: {
                    ...data,
                    products: data.products.filter((item) => item.id !== p.id),
                  },
                })
              }
            >
              Remove this manual product note
            </button>
          </details>
        ))}
    </section>
  );
}
export function StoreComparisons({ state }: { state: State }) {
  const data = supermarketData(state);
  const ids = [
    ...new Set([selectedStore(state)?.id, ...data.comparisonStores]),
  ].filter((id): id is string => !!id);
  if (ids.length < 2) return null;
  return (
    <section className="settings-card">
      <h2>Optional store comparison</h2>
      <p>
        Each estimate keeps recorded spending and prices the outstanding basket
        at that one store. Missing prices and availability remain unknown.
        Travel and convenience are not included; this is not a recommendation to
        visit more shops.
      </p>
      {ids.map((id) => {
        const store = data.stores.find((s) => s.id === id);
        if (!store) return null;
        const next = {
          ...state,
          v3: {
            ...data,
            weekStores: { ...data.weekStores, [state.week]: id },
            itemStores: {},
          },
        };
        const estimate = budget(next);
        return (
          <div className="comparison-row" key={id}>
            <strong>
              {store.chain} · {store.name}
            </strong>
            <span>
              {aud(estimate.total)} ·{" "}
              {estimate.partial ? "Partial estimate" : "Estimate"} ·{" "}
              {estimate.missing} unknown price(s)
            </span>
          </div>
        );
      })}
    </section>
  );
}
