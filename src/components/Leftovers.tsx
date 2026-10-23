import { RecipeControls } from "./RecipeControls";
import { useState } from "react";
import type { State } from "../v2-state";
import { dateForDay, enabledCategories, setDayCategories } from "../v2-state";
import { quantity } from "../domain";
import { inventory } from "../shopping";
import { supermarketData } from "../supermarkets";
import {
  librarySuggestions,
  addSuggestion,
  prepareIndependently,
  aiSnackProvider,
  canOfferAI,
  leftoverSurplus,
} from "../suggestions";
import { NumericInput } from "./NumericInput";
import { RecipePhoto, PhotoCredit } from "./RecipePhoto";
export function Leftovers({
  state,
  onChange,
  onPantry,
}: {
  state: State;
  onChange: (s: State) => void;
  onPantry: () => void;
}) {
  const [people, setPeople] = useState(state.settings.people);
  const [day, setDay] = useState(0);
  const [message, setMessage] = useState("");
  const suggestions = librarySuggestions(state, people);
  const data = supermarketData(state);
  const lots = [
    ...state.v2.purchases.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      unit: p.unit,
      prepared: p.prepared,
      remaining: p.quantity - p.consumed,
      expiry: p.expiry,
    })),
    ...Object.entries(state.v2.stock).map(([key, s]) => ({
      id: "stock/" + key,
      key,
      name: s.name,
      unit: s.unit,
      prepared: s.prepared,
      remaining: s.quantity === null ? null : s.quantity - s.consumed,
      expiry: s.expiry,
    })),
  ];
  const seenKeys = new Set<string>();
  return (
    <>
      <section className="settings-card">
        <h2>What can you use?</h2>
        <p>
          Only quantified, unexpired surplus after the selected week’s meal
          reservations is used for suggestions. Raw and prepared food are
          separate. Prepared food requires a storage date within three days and
          an unexpired use-by date and confirmation of prompt refrigeration at
          5°C or colder; correct dates are still not a food-safety guarantee.
          Raw meat, fish, eggs and milk products without use-by dates are
          excluded from suggestions, even if an inventory estimate exists.
        </p>
        <button className="secondary" onClick={onPantry}>
          Correct quantities and expiry dates in Pantry
        </button>
        {lots
          .filter((l) => l.remaining === null || l.remaining > 0)
          .map((l) => {
            const key =
              l.prepared && !l.key.endsWith("|prepared")
                ? l.key + "|prepared"
                : l.key;
            const inv = inventory(state, key);
            const first = !seenKeys.has(key);
            seenKeys.add(key);
            return (
              <div className="leftover-lot" key={l.id}>
                <div>
                  <strong>
                    {l.name} ·{" "}
                    {l.prepared ? "Prepared / cooked" : "Raw / unprepared"}
                  </strong>
                  <p>
                    {l.remaining === null
                      ? "Quantity unknown"
                      : quantity(l.remaining, l.unit) + " recorded"}{" "}
                    {first && (
                      <>
                        {" "}
                        · Ingredient total: {quantity(
                          inv.reserved,
                          l.unit,
                        )}{" "}
                        reserved · {quantity(inv.available, l.unit)} usable
                        surplus across all lots
                      </>
                    )}
                  </p>
                  <small>
                    {l.expiry ? `Use-by: ${l.expiry}` : "Use-by unknown"} ·
                    user-entered inventory estimate
                  </small>
                </div>
                <div>
                  {l.prepared && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={data.safeStorage[l.id] ?? false}
                        onChange={(e) =>
                          onChange({
                            ...state,
                            v3: {
                              ...data,
                              safeStorage: {
                                ...data.safeStorage,
                                [l.id]: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Cooled promptly and kept at 5°C or colder
                    </label>
                  )}
                  <label>
                    Storage / preparation date
                    <input
                      type="date"
                      max={new Date().toLocaleDateString("en-CA")}
                      value={data.storageDates[l.id] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...state,
                          v3: {
                            ...data,
                            storageDates: {
                              ...data.storageDates,
                              [l.id]: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
      </section>
      <section className="settings-card surplus-section">
        <h2>Use up leftovers</h2>
        <p>Existing saved recipes first. No AI-generated meals are included.</p>
        <div className="form-grid">
          <label>
            People to feed
            <NumericInput
              aria-label="Leftover people to feed"
              value={people}
              min={1}
              max={12}
              integer
              onCommit={setPeople}
            />
          </label>
          <label>
            Add to day
            <select value={day} onChange={(e) => setDay(+e.target.value)}>
              {Array.from({ length: 7 }, (_, d) => (
                <option key={d} value={d}>
                  {dateForDay(state.week, d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="leftovers-grid">
          {suggestions.map((s) => (
            <article className="leftover-recipe" key={s.recipe.id}>
              <RecipePhoto recipe={s.recipe} />
              <div className="leftover-body">
                <h3>{s.recipe.name}</h3>
                <p>
                  {s.minutes} min · {s.people} people
                  {s.urgent ? " · Use-by soon" : ""}
                </p>
                <h4>Uses surplus</h4>
                <ul>
                  {s.usedQuantities.map((i) => (
                    <li key={i.name}>
                      {i.name}: {quantity(i.quantity, i.unit)}
                      {i.prepared ? " (prepared)" : " (raw / unprepared)"}
                    </li>
                  ))}
                </ul>
                <h4>Additional ingredients needed</h4>
                {s.additionalIngredients.length ? (
                  <ul>
                    {s.additionalIngredients.map((i) => (
                      <li key={i.name}>
                        {i.name}: {quantity(i.quantity, i.unit)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>None — enough unreserved stock is recorded.</p>
                )}
                <PhotoCredit recipe={s.recipe} />
                <RecipeControls
                  recipe={s.recipe}
                  state={state}
                  onChange={onChange}
                />
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => {
                      try {
                        const old = state.plan.find(
                          (m) =>
                            m.day === day && m.category === s.recipe.category,
                        );
                        if (
                          old?.recipeId &&
                          !window.confirm(
                            "Replace the existing meal in this slot? Locked meals must first be unlocked.",
                          )
                        )
                          return;
                        let next = addSuggestion(state, s, day);
                        const enabled = enabledCategories(next, day);
                        if (!enabled.includes(s.recipe.category))
                          next = setDayCategories(next, day, [
                            ...enabled,
                            s.recipe.category,
                          ]);
                        onChange(next);
                        setMessage(
                          "Added to plan. Reservations and shopping requirements updated.",
                        );
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                    }}
                  >
                    Add to meal plan
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      try {
                        if (
                          !window.confirm(
                            "Confirm you have prepared this recipe now. This will consume unreserved stock without changing planned meals.",
                          )
                        )
                          return;
                        onChange(prepareIndependently(state, s));
                        setMessage(
                          "Preparation recorded. Inventory consumed; planned meals unchanged.",
                        );
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                    }}
                  >
                    Prepared independently
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!suggestions.length && (
          <div className="notice-block">
            <p>
              No suitable existing recipe matches safe, quantified surplus. Try
              correcting quantities or importing a suitable genuine recipe.
            </p>
            <button
              disabled={!canOfferAI(suggestions, aiSnackProvider)}
              className="secondary"
            >
              Optional AI snack generation — no provider configured
            </button>
            <p className="subtle">
              AI is a last resort for snacks only. No request is sent and no
              recipe is invented by this button.
            </p>
          </div>
        )}
        <p role="status">{message}</p>
        <p className="subtle">
          Keep perishables at 5°C or colder, follow use-by dates and safe
          cooling guidance, keep raw meat separate, and cook chicken to 75°C. Do
          not use food with uncertain storage history. Serving suggestions do
          not establish that food is safe.
        </p>
      </section>
    </>
  );
}
