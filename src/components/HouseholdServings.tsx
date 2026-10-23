import { useState, useEffect } from "react";
import type { State } from "../v2-state";
import { parseNumberDraft } from "../numeric";
import { servingCounts, updateHousehold } from "../household";
export function HouseholdServings({
  state,
  onChange,
}: {
  state: State;
  onChange: (s: State) => void;
}) {
  const [people, setPeople] = useState(String(state.settings.people));
  const [appetite, setAppetite] = useState(String(state.settings.appetite));
  useEffect(() => {
    setPeople(String(state.settings.people));
    setAppetite(String(state.settings.appetite));
  }, [state.settings.people, state.settings.appetite]);
  const [pending, setPending] = useState<{
    people: number;
    appetite: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const counts = servingCounts(state);
  const validate = (kind: "people" | "appetite") => {
    const value = kind === "people" ? people : appetite;
    const n = parseNumberDraft(
      value,
      kind === "people" ? 1 : 0.75,
      kind === "people" ? 12 : 2.5,
      kind === "people",
    );
    if (n === undefined) {
      if (kind === "people") setPeople(String(state.settings.people));
      else setAppetite(String(state.settings.appetite));
      setMessage("Invalid or empty value. The previous valid value was kept.");
      return false;
    }
    return true;
  };
  return (
    <div className="serving-settings">
      <label className="field">
        Default number of people
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="12"
          value={people}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setPeople(e.target.value)}
          onBlur={() => validate("people")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label className="field">
        Default portion / appetite multiplier
        <input
          type="number"
          inputMode="decimal"
          min="0.75"
          max="2.5"
          step="0.25"
          value={appetite}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setAppetite(e.target.value)}
          onBlur={() => validate("appetite")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <small>
          0.75× to 2.5×. Both values are applied together after confirmation.
        </small>
      </label>
      <button
        className="primary"
        onClick={() => {
          const p = parseNumberDraft(people, 1, 12, true),
            a = parseNumberDraft(appetite, 0.75, 2.5);
          if (p === undefined || a === undefined) {
            setMessage(
              "Enter valid people and portion values before updating.",
            );
            return;
          }
          setPending({ people: p, appetite: a });
        }}
      >
        Update all planned meals
      </button>
      {pending && (
        <div
          className="notice-block"
          role="dialog"
          aria-label="Confirm household serving update"
        >
          <h3>Update week beginning {state.week}</h3>
          <p>
            {counts.all} uncompleted meals: {counts.defaults} using defaults,{" "}
            {counts.custom} individually customised. Completed meals and other
            weeks remain unchanged. Recipes, locks, categories and purchases are
            kept.
          </p>
          <div className="confirmation-options">
            <button
              className="secondary"
              onClick={() => {
                onChange(
                  updateHousehold(
                    state,
                    pending.people,
                    pending.appetite,
                    "all",
                  ),
                );
                setPending(null);
                setMessage(
                  `Defaults saved. Updated ${counts.all} meals including custom portions.`,
                );
              }}
            >
              Apply to all meals, including individually customised meals (
              {counts.all})
            </button>
            <button
              className="secondary"
              onClick={() => {
                onChange(
                  updateHousehold(
                    state,
                    pending.people,
                    pending.appetite,
                    "defaults",
                  ),
                );
                setPending(null);
                setMessage(
                  `Defaults saved. Updated ${counts.defaults} meals using defaults.`,
                );
              }}
            >
              Apply only to meals using the household defaults (
              {counts.defaults})
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      <p role="status" className="subtle">
        {message}
      </p>
    </div>
  );
}
