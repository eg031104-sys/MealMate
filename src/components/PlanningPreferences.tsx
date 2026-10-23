import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { State } from "../v2-state";
import {
  preferencesFor,
  generateWeeklyPlan,
  type ScheduleConflict,
} from "../weekly-planner";
import { preferencesSchema } from "../planning-model";
import { StoreFinder } from "./StoreFinder";
import { selectedStore } from "../supermarkets";
import { Appliances } from "./Appliances";
import { RecipeControls } from "./RecipeControls";
const mealCategories = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export function PlanningPreferences({
  state,
  onChange,
  onDone,
  onCancel,
  onStores,
}: {
  state: State;
  onChange: (s: State) => void;
  onDone: (message: string) => void;
  onCancel: () => void;
  onStores: () => void;
}) {
  const [draft, setDraft] = useState(() => {
    const p = preferencesFor(state);
    return {
      ...p,
      people: String(p.people),
      appetite: String(p.appetite),
      maxTime: String(p.maxTime),
      budget: p.budget === null ? "" : String(p.budget),
    };
  });
  const [allergens, setAllergens] = useState(() =>
    preferencesFor(state).allergies.join(", "),
  );
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [conflicts, setConflicts] = useState<ScheduleConflict[]>([]),
    [busy, setBusy] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const section = (title: string, body: ReactNode) => (
    <details className="planning-section">
      <summary>
        {title}
        <ChevronDown size={19} />
      </summary>
      <div>{body}</div>
    </details>
  );
  function submit(replace = false) {
    setError("");
    setConflicts([]);
    const parsed = preferencesSchema.safeParse({
      ...draft,
      allergies: allergens
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      people: draft.people.trim() ? Number(draft.people) : NaN,
      appetite: draft.appetite.trim() ? Number(draft.appetite) : NaN,
      maxTime: draft.maxTime.trim() ? Number(draft.maxTime) : NaN,
      budget: draft.budget.trim() ? Number(draft.budget) : null,
    });
    if (!parsed.success) {
      setError(
        "Enter valid people (1–12), appetite (0.75–2.5), non-negative minutes/budget, and at least one meal category. Previous saved preferences are unchanged.",
      );
      return;
    }
    if (
      !replace &&
      state.plan.some((m) => m.recipeId && !m.locked && !m.cooked)
    ) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      const result = generateWeeklyPlan(state, parsed.data, {
        confirmReplace: replace,
      });
      if (result.conflicts.length) {
        setConflicts(result.conflicts);
        return;
      }
      onChange(result.state);
      onDone(
        `${result.filled} meal slots generated${result.empty ? `, ${result.empty} empty` : ""}. ${result.warnings.join(" ")}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <section
      className="planning-preferences"
      aria-label="Weekly planning preferences"
    >
      <h2>Plan My Meals</h2>
      <p>
        Week beginning {state.week}. These preferences apply to this week and
        are remembered for your next plan. Household defaults are kept
        separately. Daily overrides, cooked meals, locks and customised portions
        are preserved.
      </p>
      {section(
        `Number of people · ${draft.people || "enter a value"}`,
        <label>
          People
          <input
            aria-label="Planning people"
            type="number"
            min="1"
            max="12"
            inputMode="numeric"
            value={draft.people}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft({ ...draft, people: e.target.value })}
          />
        </label>,
      )}
      {section(
        `Appetite multiplier · ${draft.appetite || "enter a value"}×`,
        <label>
          Appetite multiplier
          <input
            aria-label="Planning appetite"
            type="number"
            min="0.75"
            max="2.5"
            step="0.05"
            inputMode="decimal"
            value={draft.appetite}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft({ ...draft, appetite: e.target.value })}
          />
        </label>,
      )}
      {section(
        "Dietary requirements",
        <>
          {["Vegetarian", "Vegan", "Gluten-free", "Dairy-free"].map((d) => (
            <label className="check-row" key={d}>
              <input
                type="checkbox"
                checked={draft.diet.includes(d)}
                onChange={() =>
                  setDraft({
                    ...draft,
                    diet: draft.diet.includes(d)
                      ? draft.diet.filter((x) => x !== d)
                      : [...draft.diet, d],
                  })
                }
              />
              {d}
            </label>
          ))}
          <label>
            Additional allergens to exclude
            <input
              aria-label="Planning allergens"
              value={allergens}
              onChange={(e) => setAllergens(e.target.value)}
            />
          </label>
          <p>
            Household exclusions always apply:{" "}
            {state.v2.allergies.join(", ") || "none recorded"}. Ingredient names
            and supplied allergen metadata are checked; check packaging for
            unlisted allergens.
          </p>
        </>,
      )}
      {section(
        "Available cooking appliances",
        <Appliances
          selected={draft.appliances}
          onChange={(appliances) => setDraft({ ...draft, appliances })}
        />,
      )}
      {section(
        `Maximum cooking time · ${draft.maxTime} min`,
        <label>
          Total preparation, cooking and stated waiting time
          <input
            aria-label="Planning maximum time"
            type="number"
            min="0"
            inputMode="numeric"
            value={draft.maxTime}
            onChange={(e) => setDraft({ ...draft, maxTime: e.target.value })}
          />
        </label>,
      )}
      {section(
        "Meal categories to generate",
        <>
          {mealCategories.map((c) => (
            <label className="check-row" key={c}>
              <input
                type="checkbox"
                checked={draft.categories.includes(c)}
                onChange={() =>
                  setDraft({
                    ...draft,
                    categories: draft.categories.includes(c)
                      ? draft.categories.filter((x) => x !== c)
                      : [...draft.categories, c],
                  })
                }
              />
              {c}
            </label>
          ))}
          <p>
            Individual day switches take precedence over these weekly defaults.
          </p>
        </>,
      )}
      {section(
        "Selected supermarket",
        <>
          <label>
            Saved supermarket and store
            <select
              aria-label="Planning supermarket"
              value={draft.storeId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, storeId: e.target.value || null })
              }
            >
              <option value="">Select a saved store</option>
              {state.v3?.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.chain} — {s.name}, {s.suburb}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => setFinderOpen(!finderOpen)}
          >
            {finderOpen ? "Hide store finder" : "Find nearby supermarkets"}
          </button>
          {finderOpen && (
            <StoreFinder
              state={state}
              onChange={(next) => {
                if (selectedStore(next)?.id !== selectedStore(state)?.id)
                  setDraft({
                    ...draft,
                    storeId: selectedStore(next)?.id ?? null,
                  });
                onChange(next);
              }}
            />
          )}
          <button type="button" className="text-button" onClick={onStores}>
            Manual store entry &amp; management
          </button>
          <p>
            Live supermarket catalogues, prices and stock are not connected.
          </p>
        </>,
      )}
      {section(
        "Weekly shopping budget",
        <label>
          AUD (blank means no budget)
          <input
            aria-label="Planning budget"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={draft.budget}
            onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
          />
        </label>,
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {conflicts.length > 0 && (
        <div className="notice" role="alert">
          <h3>Resolve weekly repeat conflicts</h3>
          {conflicts.map((c, i) => (
            <div key={i}>
              <p>{c.message}</p>
              {c.recipeIds.map((id) => {
                const r = state.recipes.find((r) => r.id === id);
                return (
                  r && (
                    <RecipeControls
                      key={id}
                      recipe={r}
                      state={state}
                      onChange={onChange}
                    />
                  )
                );
              })}
            </div>
          ))}
          <p>
            Change the conflicting rotation or weekday, then generate again. No
            plan has been replaced.
          </p>
        </div>
      )}
      {confirm ? (
        <div
          className="notice"
          role="dialog"
          aria-label="Confirm replacing weekly meals"
        >
          <p>
            Replace{" "}
            {
              state.plan.filter((m) => m.recipeId && !m.locked && !m.cooked)
                .length
            }{" "}
            unlocked planned meals? Locked and cooked meals, individual
            portions, purchases and daily switches are kept.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => submit(true)}
          >
            Replace unlocked meals &amp; generate
          </button>
          <button className="secondary" onClick={() => setConfirm(false)}>
            Keep existing plan
          </button>
        </div>
      ) : (
        <button className="primary" disabled={busy} onClick={() => submit()}>
          {busy ? "Generating…" : "Generate My Meals"}
        </button>
      )}
      <button className="text-button" onClick={onCancel}>
        Back to calendar
      </button>
    </section>
  );
}
