import { useState } from "react";
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
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Unknown"
                    defaultValue={
                      stock?.quantity === null || !stock
                        ? ""
                        : stock.quantity - stock.consumed
                    }
                    onBlur={(e) => {
                      if (
                        e.target.value !== "" &&
                        (!Number.isFinite(+e.target.value) ||
                          +e.target.value < 0)
                      )
                        return;
                      setStock(key, i, {
                        quantity:
                          e.target.value === ""
                            ? null
                            : +e.target.value + (stock?.consumed ?? 0),
                      });
                    }}
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
                        <input
                          type="number"
                          min={Math.max(0.001, p.consumed)}
                          step="any"
                          defaultValue={p.quantity}
                          onBlur={(e) => {
                            const q = +e.target.value;
                            if (Number.isFinite(q) && q > 0 && q >= p.consumed)
                              onChange({
                                ...state,
                                v2: {
                                  ...state.v2,
                                  purchases: state.v2.purchases.map((x) =>
                                    x.id === p.id ? { ...x, quantity: q } : x,
                                  ),
                                },
                              });
                            else e.target.value = String(p.quantity);
                          }}
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
      <section className="settings-card surplus-section">
        <span className="eyebrow">USE WHAT YOU HAVE</span>
        <h2>Surplus ideas</h2>
        <p>
          {libraryProvider.label}. Ideas use unexpired, quantified surplus after
          reservations. Prepared stock is kept separate and is not substituted
          into raw-ingredient recipes.
        </p>
        <div className="form-grid">
          <label>
            People to feed
            <input
              type="number"
              min="1"
              max="12"
              value={suggestPeople}
              onChange={(e) =>
                setSuggestPeople(
                  Math.max(1, Math.min(12, +e.target.value || 1)),
                )
              }
            />
          </label>
          <label>
            Add to day
            <select
              value={suggestDay}
              onChange={(e) => setSuggestDay(+e.target.value)}
            >
              {Array.from({ length: 7 }, (_, d) => (
                <option key={d} value={d}>
                  {dateForDay(state.week, d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {suggestions.map((s) => (
          <div className="suggestion-row" key={s.recipe.id}>
            <div>
              <strong>
                {s.recipe.emoji} {s.recipe.name}
              </strong>
              <p>
                {s.urgent ? "Use-by soon · " : ""}Uses surplus{" "}
                {s.uses.join(", ")} · {s.additional} ingredient quantities need
                topping up
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                try {
                  const existing = state.plan.find(
                    (m) =>
                      m.day === suggestDay && m.category === s.recipe.category,
                  );
                  if (
                    existing?.recipeId &&
                    !window.confirm(
                      `Replace the existing ${s.recipe.category.toLowerCase()} on ${dateForDay(state.week, suggestDay)}?`,
                    )
                  )
                    return;
                  let next = addSuggestion(state, s, suggestDay);
                  const enabled = enabledCategories(next, suggestDay);
                  if (!enabled.includes(s.recipe.category))
                    next = setDayCategories(next, suggestDay, [
                      ...enabled,
                      s.recipe.category,
                    ]);
                  onChange(next);
                  setMessage(
                    "Added to the plan. Reservations and shopping list updated.",
                  );
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              Add to plan
            </button>
          </div>
        ))}
        {!suggestions.length && (
          <p className="empty">
            No matching surplus ideas yet. Record actual stock or purchases
            first.
          </p>
        )}
        <p role="status">{message}</p>
        <p className="subtle">
          Raw surplus is still raw: use the recipe’s full cooking instructions.
          Keep perishables at 5°C or colder, follow use-by dates, keep raw meat
          separate and cook chicken to 75°C. Refrigerate cooked leftovers
          promptly; do not use food whose storage history is uncertain. Expiry
          dates are user-entered, not safety guarantees.
        </p>
      </section>
    </>
  );
}
