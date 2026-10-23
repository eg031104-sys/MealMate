import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const controls = [
          ...(panel.current?.querySelectorAll<HTMLElement>("button, select") ??
            []),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      trigger.current?.focus();
    };
  }, [open]);
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
          ref={trigger}
          className="schedule-arrow"
          aria-label={`Scheduling preferences for ${current.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={19} />
        </button>
      </div>
      {open &&
        createPortal(
          <div className="schedule-backdrop" onClick={() => setOpen(false)}>
            <div
              ref={panel}
              className="repeat-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Schedule ${current.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="schedule-heading">
                <strong>{current.name}</strong>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOpen(false)}
                  aria-label="Close scheduling preferences"
                >
                  Close
                </button>
              </div>
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
                          : {
                              mode: e.target.value as
                                "normal" | "weekly-random",
                            },
                    })
                  }
                >
                  <option value="normal">Normal rotation</option>
                  <option value="weekly-random">
                    Every week on a random day
                  </option>
                  <option value="weekly-fixed">
                    Every week on a fixed day
                  </option>
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
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
