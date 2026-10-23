import { useState } from "react";
import type { State } from "../v2-state";
import type { ShoppingItem } from "../domain";
import type { StoreProduct } from "../v3-state";
import {
  assignedStore,
  productsFor,
  shoppingPreferences,
  selectProduct,
  productSelectionKey,
  supermarketData,
  unavailable,
  chooseStoreProduct,
} from "../supermarkets";
import { productFor, recommendation, aud } from "../shopping";
import { communityProducts, productImageUrl } from "../product-source";
import { estimateIngredient } from "../product-estimates";
export function ProductPhoto({ product }: { product: StoreProduct }) {
  const [failed, setFailed] = useState(false);
  const image = productImageUrl(product.image);
  return image && product.imageLicense && !failed ? (
    <img
      className="product-photo"
      src={image}
      alt={`${product.name} — ${product.packageLabel ?? product.size + " " + product.unit}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="product-photo product-placeholder"
      role="img"
      aria-label="Product photo unavailable"
    >
      No photo
    </span>
  );
}
export function ShoppingPreference({
  state,
  onChange,
}: {
  state: State;
  onChange: (s: State) => void;
}) {
  const data = supermarketData(state),
    shopping = shoppingPreferences(state);
  return (
    <label className="field">
      Shopping preference
      <select
        aria-label="Shopping preference"
        value={shopping.preference}
        onChange={(e) =>
          onChange({
            ...state,
            v3: {
              ...data,
              shopping: {
                ...shopping,
                preference: e.target.value as typeof shopping.preference,
              },
            },
          })
        }
      >
        <option>Budget</option>
        <option>Balanced</option>
        <option>Premium</option>
      </select>
      <small>
        Balances ingredient suitability, purchase cost and avoidable waste.
      </small>
    </label>
  );
}
export function ProductSuggestion({
  state,
  item,
  onChange,
}: {
  state: State;
  item: ShoppingItem;
  onChange: (s: State) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [found, setFound] = useState<StoreProduct[]>([]),
    [price, setPrice] = useState("");
  const selected = chooseStoreProduct(
      state,
      item,
      recommendation(state, item).shortage,
    ),
    rec = recommendation(state, item),
    product = productFor(state, item),
    data = supermarketData(state),
    shopping = shoppingPreferences(state);
  const options = [
    ...new Map(
      [...found, ...productsFor(state, item)].map((p) => [p.id, p]),
    ).values(),
  ];
  const overrideKey = `${productSelectionKey(state, item.key)}/${selected?.id ?? "generic"}`;
  return (
    <section
      className="product-suggestion"
      aria-label={`Product for ${item.name}`}
    >
      {selected ? (
        <>
          <h4>
            {selected.source === "demo" || selected.source === "estimate"
              ? "Saved example package"
              : "Suggested product"}
          </h4>
          <div className="product-overview">
            <ProductPhoto key={selected.id} product={selected} />
            <div>
              <strong>{selected.name}</strong>
              <div>
                {selected.brand} ·{" "}
                {selected.packageLabel ?? `${selected.size} ${selected.unit}`}
              </div>
              <div>
                {product?.source === "estimate" ? "~" : ""}
                {product?.price !== undefined
                  ? aud(product.price)
                  : "Price unknown"}{" "}
                per pack · {product?.priceLabel ?? "Price unknown"}
              </div>
            </div>
          </div>
          {product?.priceLabel === "Previous price" && selected.observedAt && (
            <small>
              Previous price observed{" "}
              {new Date(selected.observedAt).toLocaleDateString("en-AU")}
            </small>
          )}
          {selected.source === "demo" || selected.source === "estimate" ? (
            <small>Example package only, not a verified product record.</small>
          ) : null}
          <small>
            {product?.availabilityLabel} ·{" "}
            {selected.scope === "chain-community"
              ? "Community-reported retailer association, not a retailer catalogue or local stock check."
              : "Saved product details; local availability is not verified."}
          </small>
          {selected.sourceUrl && selected.source === "community" && (
            <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
              Open Food Facts contributors · ODbL / DbCL; photo CC BY-SA 3.0
            </a>
          )}
        </>
      ) : (
        <p>
          <strong>Generic ingredient</strong> ·{" "}
          {product?.source === "estimate" ? "~" : ""}
          {rec.cost === undefined ? "Price unknown" : aud(rec.cost)} ·{" "}
          {product?.priceLabel ?? "Price unknown"}
          <small>
            No verified retailer product match.{" "}
            {product?.source === "estimate"
              ? "Broad Australian retail allowance; package size is an estimate."
              : "Add your package size and price below."}
          </small>
        </p>
      )}
      {selected?.source === "community" && (
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank"
          rel="noreferrer"
        >
          Photo licence: CC BY-SA 3.0
        </a>
      )}
      {product && (
        <p className="subtle">
          Buy {rec.packs} pack{rec.packs === 1 ? "" : "s"} × {product.size}{" "}
          {item.unit}. Potential surplus:{" "}
          {Math.max(0, rec.buy - rec.shortage).toLocaleString("en-AU", {
            maximumFractionDigits: 2,
          })}{" "}
          {item.unit}; added to inventory only after recording a purchase.
        </p>
      )}
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {selected ? "Change suggested product" : "Choose a product"}
      </button>
      {selected && (
        <button
          className="text-button"
          onClick={() => {
            onChange({
              ...state,
              v3: {
                ...data,
                products: data.products.map((p) =>
                  p.id === selected.id
                    ? {
                        ...p,
                        availability: "unavailable",
                        availabilitySource: "user",
                        availabilityAt: new Date().toISOString(),
                      }
                    : p,
                ),
              },
            });
            setOpen(true);
          }}
        >
          Mark suggested product unavailable
        </button>
      )}
      {open && (
        <div className="product-alternatives">
          <button
            className="secondary"
            onClick={() => {
              onChange(selectProduct(state, item.key, null));
              setOpen(false);
            }}
          >
            Use generic ingredient
          </button>
          <p className="subtle">
            Open Food Facts is a community product directory, not a supermarket
            price feed. Check the label for dietary suitability and allergens.
            Search is manual, cached and rate limited.
          </p>
          <button
            className="secondary"
            disabled={busy || !assignedStore(state, item.key)}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const results = await communityProducts.search(
                  assignedStore(state, item.key)!,
                  item,
                );
                setFound(results);
                setMessage(
                  results.length
                    ? `${results.length} potential matches. Check the product and pack before choosing.`
                    : "No suitable products returned. Use the generic estimate or enter your own package.",
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Searching…" : "Find real product records"}
          </button>
          <p role="status">{message}</p>
          {options.map((p) => (
            <article className="product-alternative" key={p.id}>
              <ProductPhoto product={p} />
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.brand} · {p.packageLabel ?? `${p.size} ${p.unit}`}
                </small>
                <small>
                  {p.source === "user" && p.price !== undefined
                    ? `${aud(p.price)} · User price`
                    : estimateIngredient(item, p.size)
                      ? `~${aud(estimateIngredient(item, p.size)!.price)} · Estimated price`
                      : "Price unknown"}
                </small>
                <small>
                  {unavailable(p)
                    ? "Reported unavailable"
                    : "Availability unknown"}
                </small>
                <button
                  className="secondary"
                  disabled={unavailable(p)}
                  onClick={() => {
                    let next = {
                      ...state,
                      v3: {
                        ...data,
                        products: [
                          ...data.products.filter((x) => x.id !== p.id),
                          p,
                        ],
                      },
                    };
                    next = selectProduct(next, item.key, p.id) as typeof next;
                    onChange(next);
                    setOpen(false);
                  }}
                >
                  Choose this product
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <details>
        <summary>Price override</summary>
        <label className="field">
          Your price per {product?.size ?? item.quantity} {item.unit} package
          (AUD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            if (!product) {
              setMessage(
                "Set a package size using Package size & price before entering an override.",
              );
              return;
            }
            if (price.trim() === "" || !Number.isFinite(+price) || +price < 0) {
              setMessage("Enter a valid non-negative package price.");
              return;
            }
            onChange({
              ...state,
              v3: {
                ...data,
                shopping: {
                  ...shopping,
                  priceOverrides: {
                    ...shopping.priceOverrides,
                    [overrideKey]: +price,
                  },
                },
              },
            });
            setMessage("User price saved.");
          }}
        >
          Save price override
        </button>
        {shopping.priceOverrides[overrideKey] !== undefined && (
          <button
            className="text-button"
            onClick={() => {
              const prices = { ...shopping.priceOverrides };
              delete prices[overrideKey];
              onChange({
                ...state,
                v3: {
                  ...data,
                  shopping: { ...shopping, priceOverrides: prices },
                },
              });
            }}
          >
            Remove price override
          </button>
        )}
      </details>
      <p role="status">{!open && message}</p>
    </section>
  );
}
