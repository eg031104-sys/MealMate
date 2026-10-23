import { useState } from "react";
import type { State } from "../v2-state";
import { applyRecipeEstimates, defaultEstimates } from "../measurements";
import type { MeasurementOverrides } from "../measurements";
export function MeasurementSettings({
  state,
  onChange,
}: {
  state: State;
  onChange: (s: State) => void;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries({
        ...defaultEstimates,
        ...state.settings.measurementOverrides,
      }).map(([key, value]) => [key, String(value.quantity)]),
    ),
  );
  const [salt, setSalt] = useState(
    String(
      state.settings.measurementOverrides?.["salt|to taste"]?.quantity ?? "",
    ),
  );
  const [message, setMessage] = useState("");
  const rules = { ...defaultEstimates, ...state.settings.measurementOverrides };
  return (
    <section className="settings-card">
      <h2>Approximate recipe measurements</h2>
      <p>
        Ingredient-specific estimates, not exact source measurements. Changing
        these recalculates recipe requirements, not recorded purchases or pantry
        stock. Original wording is retained.
      </p>
      <label className="field">
        Find a conversion
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {Object.entries(rules)
        .filter(
          ([key]) =>
            key.includes(query.toLowerCase()) && !key.endsWith("|to taste"),
        )
        .slice(0, 12)
        .map(([key, rule]) => (
          <label className="measurement-rule" key={key}>
            {key.replace("|", " · one ")}
            <input
              aria-label={key}
              type="number"
              inputMode="decimal"
              min="0.001"
              step="any"
              value={draft[key] ?? String(rule.quantity)}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              onFocus={(e) => e.currentTarget.select()}
            />
            <span>{rule.unit}</span>
          </label>
        ))}
      <p>
        Showing up to 12 matches. Search for an ingredient to edit its
        estimates.
      </p>
      <label className="field">
        Optional salt “to taste” estimate per source recipe (g)
        <input
          type="number"
          min="0.001"
          step="any"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="Blank = excluded from exact totals"
        />
      </label>
      <button
        className="primary"
        onClick={() => {
          const overrides: MeasurementOverrides = {
            ...state.settings.measurementOverrides,
          };
          for (const [key, text] of Object.entries(draft)) {
            const n = Number(text);
            if (!text.trim() || !Number.isFinite(n) || n <= 0) {
              setMessage(
                `Enter a positive estimate for ${key}. Previous values are kept.`,
              );
              return;
            }
            overrides[key] = { quantity: n, unit: rules[key].unit };
          }
          if (salt.trim()) {
            const n = Number(salt);
            if (!Number.isFinite(n) || n <= 0) {
              setMessage("Enter a positive salt estimate, or leave it blank.");
              return;
            }
            overrides["salt|to taste"] = { quantity: n, unit: "g" };
          } else delete overrides["salt|to taste"];
          const recipes = state.recipes.map((r) =>
            applyRecipeEstimates(
              {
                ...r,
                ingredients: r.ingredients.map((i) =>
                  i.estimateKey?.endsWith("|to taste") &&
                  !overrides[i.estimateKey]
                    ? { ...i, quantity: 0, excludeFromShopping: true }
                    : i,
                ),
              },
              overrides,
            ),
          );
          onChange({
            ...state,
            settings: { ...state.settings, measurementOverrides: overrides },
            recipes,
          });
          setMessage(
            "Measurement estimates saved. Shopping and pantry requirements recalculated; purchases are retained.",
          );
        }}
      >
        Save measurement estimates
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
