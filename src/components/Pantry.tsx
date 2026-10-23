import { useState } from "react";
import { NumericInput } from "./NumericInput";
import type { State, Stock } from "../v2-state";
import {
  dateForDay,
  enabledCategories,
  itemKey,
  setDayCategories,
} from "../v2-state";
import {
  available,
  inventory,
  isStaple,
  requirements,
  stapleSuggested,
} from "../shopping";
import {
  addSuggestion,
  librarySuggestions,
  libraryProvider,
} from "../suggestions";
import type { Ingredient } from "../domain";
import { quantity } from "../domain";
type Props = { state: State; onChange: (s: State) => void };
export function Pantry({ state, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Ingredient["unit"]>("g");
  const [suggestPeople, setSuggestPeople] = useState(state.settings.people);
  const [suggestDay, setSuggestDay] = useState(0);
  const [message, setMessage] = useState("");
  const all = new Map<string, Ingredient>();
  for (const r of state.recipes)
    for (const i of r.ingredients) all.set(itemKey(i), i);
  for (const p of state.v2.purchases) all.set(p.key, p);
  for (const [key, s] of Object.entries(state.v2.stock))
    all.set(key, { ...s, quantity: s.quantity ?? 0 });
  for (const n of state.pantry)
    if (
      ![...all.values()].some((i) => i.name.toLowerCase() === n.toLowerCase())
    ) {
      const i = {
        name: n,
        unit: "g" as const,
        quantity: 0,
        department: "Pantry & grains",
      };
      all.set(itemKey(i), i);
    }
  const items = [...all.entries()]
    .filter(([, i]) => i.name.toLowerCase().includes(query.toLowerCase()))
    .sort(
      ([ak, a], [bk, b]) =>
        Number(
          !!state.v2.stock[bk] ||
            isStaple(state, b.name) ||
            available(state, bk) > 0,
        ) -
          Number(
            !!state.v2.stock[ak] ||
              isStaple(state, a.name) ||
              available(state, ak) > 0,
          ) || a.name.localeCompare(b.name),
    )
    .slice(0, 60);
  const suggestions = librarySuggestions(state, suggestPeople);
  const setStock = (key: string, i: Ingredient, patch: Partial<Stock>) =>
    onChange({
      ...state,
      v2: {
        ...state.v2,
        stock: {
          ...state.v2.stock,
          [key]: {
            ...(state.v2.stock[key] ?? {
              name: i.name,
              unit: i.unit,
              department: i.department,
              quantity: null,
              consumed: 0,
              prepared: false,
            }),
            ...patch,
          },
        },
      },
    });
  return (
    <>
      <section className="settings-card">
        <h2>Pantry & stock</h2>
        <p>
          Opening stock is separate from recorded purchases. Reservations follow
          the selected week’s uncooked meals. Stock is only consumed when you
          explicitly mark a meal cooked. Expired stock is excluded.
        </p>
        <div className="inline-form">
          <input
            aria-label="Search pantry"
            type="search"
            placeholder="Search ingredients or staples"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="inline-form">
          <input
            aria-label="New pantry ingredient"
            placeholder="Add another ingredient"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="New ingredient unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as Ingredient["unit"])}
          >
            {["g", "ml", "each"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={() => {
              if (!name.trim()) return;
              const i = {
                name: name.trim(),
                unit,
                quantity: 0,
                department: "Pantry & grains",
              };
              setStock(itemKey(i), i, {});
              setName("");
            }}
          >
            Add
          </button>
        </div>
        {items.map(([key, i]) => {
          const stock = state.v2.stock[key];
          const inv = inventory(state, key);
          return (
            <details className="pantry-stock" key={key}>
              <summary>
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {quantity(inv.onHand, i.unit)} on hand ·{" "}
                    {quantity(inv.reserved, i.unit)} reserved ·{" "}
                    {quantity(inv.available, i.unit)} surplus
                    {stock?.quantity === null ? " · opening stock unknown" : ""}
                  </small>
                </span>
                {isStaple(state, i.name) && <span className="tag">Staple</span>}
              </summary>
              <div className="form-grid">
                <label>
                  Current opening stock ({i.unit}, excludes purchases)
                  <NumericInput
                    value={
                      stock?.quantity == null
                        ? null
                        : stock.quantity - stock.consumed
                    }
                    min={0}
                    onCommit={(value) =>
                      setStock(key, i, {
                        quantity: value + (stock?.consumed ?? 0),
                      })
                    }
                  />
                </label>
                <label>
                  Opening stock expiry
                  <input
                    type="date"
                    value={stock?.expiry ?? ""}
                    onChange={(e) =>
                      setStock(key, i, { expiry: e.target.value || undefined })
                    }
                  />
                </label>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={stock?.prepared ?? false}
                  onChange={(e) =>
                    setStock(key, i, { prepared: e.target.checked })
                  }
                />
                Opening stock is prepared / cooked
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={isStaple(state, i.name)}
                  onChange={(e) =>
                    onChange({
                      ...state,
                      v2: {
                        ...state.v2,
                        staples: {
                          ...state.v2.staples,
                          [i.name.toLowerCase()]: e.target.checked,
                        },
                      },
                    })
                  }
                />
                Pantry staple
                {stapleSuggested(state, i.name)
                  ? " — suggested from ingredient or past purchases"
                  : ""}
              </label>
              <p className="subtle">
                Purchased {quantity(inv.purchased, i.unit)} · consumed{" "}
                {quantity(inv.consumed, i.unit)}. Unknown stock is never counted
                as confirmed inventory.
              </p>
              {state.v2.purchases
                .filter((p) => p.key === key)
                .map((p) => (
                  <div className="receipt" key={p.id}>
                    <strong>
                      Purchase: {quantity(p.quantity, p.unit)} ·{" "}
                      {p.prepared ? "prepared" : "raw / unprepared"}
                    </strong>
                    <p className="subtle">
                      Week {p.week} · {quantity(p.consumed, p.unit)} consumed
                    </p>
                    <div className="form-grid">
                      <label>
                        Correct purchase quantity ({p.unit})
                        <NumericInput
                          value={p.quantity}
                          min={Math.max(0.001, p.consumed)}
                          onCommit={(value) =>
                            onChange({
                              ...state,
                              v2: {
                                ...state.v2,
                                purchases: state.v2.purchases.map((x) =>
                                  x.id === p.id ? { ...x, quantity: value } : x,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Use-by / expiry
                        <input
                          type="date"
                          value={p.expiry ?? ""}
                          onChange={(e) =>
                            onChange({
                              ...state,
                              v2: {
                                ...state.v2,
                                purchases: state.v2.purchases.map((x) =>
                                  x.id === p.id
                                    ? {
                                        ...x,
                                        expiry: e.target.value || undefined,
                                      }
                                    : x,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
            </details>
          );
        })}
        <p className="subtle">
          Showing up to 60 matches. Purchases without expiry dates need
          reconfirmation after 30 days and stop counting as available. Set a
          checked use-by date or correct your current stock. Purchase history
          never proves food is still available.
        </p>
      </section>
    </>
  );
}
