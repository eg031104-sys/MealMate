import { useState } from "react";
import { discoverable } from "../catalogue";
import { RecipePhoto, PhotoCredit } from "./RecipePhoto";
import type { Recipe } from "../domain";
import { matches, usable } from "../domain";
import type { State } from "../storage";
import {
  importRecipes,
  mealDB,
  normaliseRecipe,
  recipeTemplate,
  reviewReady,
} from "../recipe-import";
export function RecipeLibrary({
  state,
  onChange,
  onOpen,
}: {
  state: State;
  onChange: (s: State) => void;
  onOpen: (r: Recipe) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [limit, setLimit] = useState(36);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("name");
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState(false);
  const filtered = state.recipes
    .filter(
      (r) =>
        (showArchived || discoverable(r)) &&
        (category === "Review" || usable(r)) &&
        (category === "All" || category === "Review"
          ? category !== "Review" || !usable(r)
          : r.category === category) &&
        (!onlyMatch || matches(r, state.settings)) &&
        (r.name + " " + r.ingredients.map((i) => i.name).join(" "))
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "time"
        ? a.prep + a.cook - b.prep - b.cook
        : sort === "favourites"
          ? Number(!!b.favourite) - Number(!!a.favourite) ||
            a.name.localeCompare(b.name)
          : Number(b.origin === "external") - Number(a.origin === "external") ||
            a.name.localeCompare(b.name),
    );
  function receive(values: unknown[]) {
    const result = importRecipes(state.recipes, values);
    onChange({ ...state, recipes: result.recipes });
    setMessage(
      `${result.added} recipes imported; ${result.duplicates} duplicates skipped. Incomplete recipes stay out of plans until reviewed.`,
    );
  }
  return (
    <>
      <div className="toolbar">
        <input
          className="grow"
          aria-label="Search recipes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes or ingredients"
        />
        <select
          aria-label="Recipe category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {[
            "All",
            "Breakfast",
            "Lunch",
            "Dinner",
            "Snacks",
            "Sides",
            "Review",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Sort recipes"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name</option>
          <option value="time">Quickest</option>
          <option value="favourites">Favourites first</option>
        </select>
      </div>
      <div className="button-row">
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyMatch}
            onChange={(e) => setOnlyMatch(e.target.checked)}
          />
          Fits my kitchen & diet
        </label>
        <button className="secondary" onClick={() => setTools(!tools)}>
          Import / create recipes
        </button>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived recipes (saved references are kept)
      </label>
      <p className="subtle">
        {filtered.length} recipes ·{" "}
        {state.recipes.filter((r) => !usable(r)).length} awaiting review ·
        favourites may repeat in generated plans
      </p>
      {tools && (
        <section className="settings-card recipe-tools">
          <h2>Grow your recipe collection</h2>
          <p>
            Import MealMate recipe JSON arrays with attribution, or use
            TheMealDB’s personal/development endpoint. Source recipes often need
            serving sizes, metric quantities, dietary tags and appliance checks.
          </p>
          <label className="field">
            Import a recipe JSON file
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  try {
                    if (file.size > 10_000_000)
                      throw Error("Recipe file exceeds 10 MB");
                    const value = JSON.parse(await file.text());
                    if (!Array.isArray(value))
                      throw Error("Expected a JSON array of MealMate recipes");
                    receive(value);
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
              }}
            />
          </label>
          <div className="inline-form">
            <input
              aria-label="TheMealDB search"
              placeholder="Search TheMealDB by recipe name"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
            />
            <button
              disabled={busy || !sourceQuery.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  receive(await mealDB.search(sourceQuery));
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Importing…" : "Search & import"}
            </button>
          </div>
          <p className="subtle">
            <a href={mealDB.terms} target="_blank" rel="noreferrer">
              TheMealDB terms
            </a>{" "}
            · Personal/development use only. No bulk dataset is bundled. Images
            are optional remote source links and may be unavailable offline.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setEditingId(null);
              setEditor(
                JSON.stringify(
                  { ...recipeTemplate, id: crypto.randomUUID() },
                  null,
                  2,
                ),
              );
            }}
          >
            Create / view JSON format
          </button>
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="library-grid">
        {filtered.slice(0, limit).map((r) => (
          <article className="library-card" key={r.id}>
            <button className="library-open" onClick={() => onOpen(r)}>
              <RecipePhoto recipe={r} />
              <div className="library-body">
                <span className="eyebrow">{r.category}</span>
                <h3>{r.name}</h3>
                <small>
                  {r.source?.name ??
                    (r.origin === "ai"
                      ? "Archived AI-authored MealMate starter"
                      : "Household recipe")}
                  {r.archived ? " · Archived" : ""}
                </small>
                <span className="meta">
                  {r.prep + r.cook + (r.wait ?? 0)} min · {r.servings || "?"}{" "}
                  serves
                  {!usable(r) && " · Review required"}
                </span>
              </div>
            </button>
            <div className="library-controls">
              <button
                aria-pressed={!!r.favourite}
                onClick={() =>
                  onChange({
                    ...state,
                    recipes: state.recipes.map((x) =>
                      x.id === r.id ? { ...x, favourite: !x.favourite } : x,
                    ),
                  })
                }
              >
                {r.favourite ? "★ Favourite" : "☆ Favourite"}
              </button>
              <button
                onClick={() => {
                  setEditingId(r.id);
                  setEditor(JSON.stringify(r, null, 2));
                }}
              >
                Edit / review
              </button>
            </div>
          </article>
        ))}
      </div>
      {filtered.length > limit && (
        <p className="subtle">
          Showing {Math.min(limit, filtered.length)} of {filtered.length}.{" "}
          <button className="secondary" onClick={() => setLimit(limit + 36)}>
            Show more recipes
          </button>
        </p>
      )}
      {editor && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Recipe editor"
          >
            <h2>Edit & review recipe</h2>
            <p>
              Metric units: g, ml or each. Use 0 for unknown quantities and list
              problems in “review”. Clear the review array only after checking
              quantities, servings, times, dietary tags and cooking
              instructions. Appliance names must match your kitchen or the saved
              generic Hob/Oven methods.
            </p>
            <textarea
              className="json-editor"
              aria-label="Recipe JSON"
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
            />
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  try {
                    const r = normaliseRecipe(JSON.parse(editor));
                    if (!r.review?.length && !reviewReady(r))
                      throw Error("Recipe is incomplete");
                    if (editingId) {
                      const previous = state.recipes.find(
                        (old) => old.id === editingId,
                      );
                      if (previous?.source?.externalId)
                        r.source = previous.source;
                      if (r.id !== editingId)
                        throw Error(
                          "Keep the existing recipe ID to preserve meal links",
                        );
                      onChange({
                        ...state,
                        recipes: state.recipes.map((old) =>
                          old.id === editingId ? r : old,
                        ),
                      });
                    } else receive([r]);
                    setEditor("");
                    setMessage("Recipe saved.");
                  } catch (error) {
                    setMessage("Recipe rejected: " + (error as Error).message);
                  }
                }}
              >
                Validate & save
              </button>
              <button onClick={() => setEditor("")}>Cancel</button>
            </div>
            <p role="status">{message}</p>
          </section>
        </div>
      )}
    </>
  );
}
