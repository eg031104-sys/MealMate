import { useState } from "react";
import { Heart, ChevronDown } from "lucide-react";
import type { Recipe } from "../domain";
import type { State } from "../v2-state";
import type { RepeatPreference } from "../planning-model";
export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function RecipeControls({
  recipe,
  state,
  onChange,
}: {
  recipe: Recipe;
  state: State;
  onChange: (s: State) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = state.recipes.find((r) => r.id === recipe.id) ?? recipe;
  const change = (patch: Partial<Recipe>) =>
    onChange({
      ...state,
      recipes: state.recipes.map((r) =>
        r.id === recipe.id ? { ...r, ...patch } : r,
      ),
    });
  const repeat = current.repeat ?? { mode: "normal" };
  return (
    <div className="recipe-preferences">
      <div className="recipe-heart-row">
        <button
          type="button"
          className="heart-control"
          aria-label={`${current.favourite ? "Unfavourite" : "Favourite"} ${current.name}`}
          aria-pressed={!!current.favourite}
          onClick={() => change({ favourite: !current.favourite })}
        >
          <Heart size={19} fill={current.favourite ? "currentColor" : "none"} />
          <span>{current.favourite ? "Favourited" : "Favourite"}</span>
        </button>
        <button
          type="button"
          className="schedule-arrow"
          aria-label={`Scheduling preferences for ${current.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={19} />
        </button>
      </div>
      {open && (
        <div className="repeat-panel">
          <label>
            Recipe rotation · {current.category}
            <select
              aria-label={`Repeat ${current.name}`}
              value={repeat.mode}
              onChange={(e) =>
                change({
                  repeat:
                    e.target.value === "weekly-fixed"
                      ? { mode: "weekly-fixed", day: 0 }
                      : { mode: e.target.value as "normal" | "weekly-random" },
                })
              }
            >
              <option value="normal">Normal rotation</option>
              <option value="weekly-random">Every week, random day</option>
              <option value="weekly-fixed">Every week, same day</option>
            </select>
          </label>
          {repeat.mode === "weekly-fixed" && (
            <label>
              Weekday
              <select
                aria-label={`Weekday for ${current.name}`}
                value={repeat.day}
                onChange={(e) =>
                  change({
                    repeat: {
                      mode: "weekly-fixed",
                      day: Number(e.target.value),
                    } as RepeatPreference,
                  })
                }
              >
                {weekdays.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          )}
          <small>
            Favourites get a modest boost. Weekly repeats are independent and
            still respect dietary restrictions and locked meals.
          </small>
        </div>
      )}
    </div>
  );
}
