import { useState } from "react";
import type { State } from "../v2-state";
import type { Recipe } from "../domain";
import {
  mealHistory,
  confirmCooked,
  correctCookedDate,
  removeCookedEntry,
  editLegacyHistory,
  type MealHistoryRow,
} from "../meal-history";
import { today } from "../shopping";
import { RecipePhoto } from "./RecipePhoto";
import { RecipeControls } from "./RecipeControls";
export function MyMeals({
  state,
  onChange,
  onOpen,
}: {
  state: State;
  onChange: (s: State) => void;
  onOpen: (r: Recipe) => void;
}) {
  const [tab, setTab] = useState<"History" | "Favourites">("History"),
    [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(30);
  const [editing, setEditing] = useState<MealHistoryRow | null>(null),
    [date, setDate] = useState(today()),
    [message, setMessage] = useState(""),
    [restore, setRestore] = useState(true);
  const rows = mealHistory(state).filter(
    (h) =>
      filter === "all" ||
      (filter === "cooked" ? h.status !== "planned" : h.status === "planned"),
  );
  const favourites = state.recipes.filter((r) => r.favourite);
  const act = (fn: () => State) => {
    try {
      onChange(fn());
      setEditing(null);
      setMessage("Meal history updated.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const openEdit = (row: MealHistoryRow) => {
    setEditing(row);
    setDate(
      row.status === "planned" || row.status === "legacy" || row.date > today()
        ? today()
        : row.date,
    );
    setRestore(true);
  };
  return (
    <section className="my-meals">
      <div role="tablist" aria-label="My Meals">
        <button
          role="tab"
          aria-selected={tab === "History"}
          onClick={() => setTab("History")}
        >
          History
        </button>
        <button
          role="tab"
          aria-selected={tab === "Favourites"}
          onClick={() => setTab("Favourites")}
        >
          Favourites
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {tab === "History" ? (
        <div role="tabpanel" aria-label="Meal history">
          <p>
            Dates passing never mark meals cooked. Confirm cooking explicitly. A
            history-only confirmation does not consume pantry stock.
          </p>
          <label>
            Show
            <select
              aria-label="History filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setLimit(30);
              }}
            >
              <option value="all">Planned and confirmed cooked</option>
              <option value="cooked">Confirmed cooked only</option>
              <option value="planned">Planned only</option>
            </select>
          </label>
          {!rows.length && (
            <p>No meals recorded here yet. Plan a week to get started.</p>
          )}
          <div className="history-list">
            {rows.slice(0, limit).map((row) => {
              const r = state.recipes.find((r) => r.id === row.recipeId);
              return (
                <article className="history-card" key={row.id}>
                  <div className="history-summary">
                    <button
                      className="history-photo"
                      disabled={!r}
                      onClick={() => r && onOpen(r)}
                    >
                      {r && <RecipePhoto recipe={r} />}
                    </button>
                    <div>
                      <button
                        className="recipe-title"
                        onClick={() => r && onOpen(r)}
                      >
                        {r?.name ?? "Saved recipe unavailable"}
                      </button>
                      <p>
                        {row.status === "planned"
                          ? "Planned · not confirmed cooked"
                          : row.status === "legacy"
                            ? "Previously marked cooked · actual date not recorded"
                            : "✓ Confirmed cooked"}{" "}
                        · {row.status === "legacy" ? "planned for " : ""}
                        {row.date} · {row.meal.category}
                      </p>
                      <small>
                        {row.meal.people} people · {row.meal.appetite}× appetite
                      </small>
                    </div>
                  </div>
                  {r && (
                    <RecipeControls
                      recipe={r}
                      state={state}
                      onChange={onChange}
                    />
                  )}
                  <button className="secondary" onClick={() => openEdit(row)}>
                    {row.status === "planned"
                      ? "Confirm cooked"
                      : "Correct / remove history"}
                  </button>
                </article>
              );
            })}
          </div>
          {rows.length > limit && (
            <button className="secondary" onClick={() => setLimit(limit + 30)}>
              Show more history
            </button>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Favourite recipes">
          <p>
            Favourites receive a modest planning boost; only explicit weekly
            repeats reserve a slot.
          </p>
          {!favourites.length && (
            <p>Tap a recipe’s heart to save a favourite.</p>
          )}
          <div className="library-grid">
            {favourites.map((r) => (
              <article className="library-card" key={r.id}>
                <button className="library-open" onClick={() => onOpen(r)}>
                  <RecipePhoto recipe={r} />
                  <div className="library-body">
                    <h3>{r.name}</h3>
                    <p>
                      {r.category}
                      {r.archived
                        ? " · Archived (excluded from automatic planning)"
                        : ""}
                    </p>
                  </div>
                </button>
                <RecipeControls recipe={r} state={state} onChange={onChange} />
              </article>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal history-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Edit meal history"
          >
            <h2>
              {editing.status === "planned"
                ? "Confirm this meal was cooked"
                : "Correct cooking history"}
            </h2>
            <p>{state.recipes.find((r) => r.id === editing.recipeId)?.name}</p>
            <label>
              Actual cooking date
              <input
                aria-label="Actual cooking date"
                type="date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p>
              {editing.status === "planned"
                ? "This records cooking and releases the meal reservation. It does not consume stock. Use “Mark cooked & consume stock” in the planner for inventory consumption."
                : editing.entry?.stockDeltas
                  ? "This entry has a recorded inventory-consumption ledger. Changing its date does not change inventory."
                  : "This older or history-only entry has no inventory ledger. Corrections leave stock unchanged; correct quantities in Pantry if needed."}
            </p>
            <button
              className="primary"
              onClick={() =>
                act(() =>
                  editing.status === "planned"
                    ? confirmCooked(state, editing.week, editing.meal, date)
                    : editing.entry
                      ? correctCookedDate(state, editing.id, date)
                      : editLegacyHistory(state, editing, date),
                )
              }
            >
              Save cooking confirmation
            </button>
            {editing.status !== "planned" && (
              <>
                {editing.entry?.stockDeltas && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={restore}
                      onChange={(e) => setRestore(e.target.checked)}
                    />
                    Restore this entry’s recorded consumption when removing
                  </label>
                )}
                <button
                  className="secondary"
                  onClick={() =>
                    act(() =>
                      editing.entry
                        ? removeCookedEntry(state, editing.id, restore)
                        : editLegacyHistory(state, editing, null),
                    )
                  }
                >
                  Remove cooking confirmation
                </button>
              </>
            )}
            <button className="text-button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {message && <p role="alert">{message}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
