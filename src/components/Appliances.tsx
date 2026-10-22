import { useState } from "react";
import { applianceGroups } from "../appliances";
export function Appliances({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const toggle = (a: string) =>
    onChange(
      selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a],
    );
  const known = Object.values(applianceGroups).flat();
  const extra = selected.filter((a) => !known.includes(a));
  return (
    <div className="appliance-picker">
      <label className="field">
        Find an appliance
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your kitchen…"
        />
      </label>
      <div className="appliance-scroll">
        {Object.entries({
          ...applianceGroups,
          ...(extra.length ? { "Custom & saved appliances": extra } : {}),
        }).map(([group, values]) => {
          const matches = values.filter((a) =>
            a.toLowerCase().includes(query.toLowerCase()),
          );
          return matches.length ? (
            <fieldset key={group}>
              <legend>{group}</legend>
              {matches.map((a) => (
                <label className="check-row" key={a}>
                  <input
                    type="checkbox"
                    checked={selected.includes(a)}
                    onChange={() => toggle(a)}
                  />
                  {a}
                  {a === "Hob" || a === "Oven" ? " (saved generic method)" : ""}
                </label>
              ))}
            </fieldset>
          ) : null;
        })}
      </div>
      <div className="inline-form">
        <input
          aria-label="Custom appliance"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Add a custom appliance"
        />
        <button
          onClick={() => {
            const a = custom.trim();
            if (a && !selected.some((x) => x.toLowerCase() === a.toLowerCase()))
              onChange([...selected, a]);
            setCustom("");
          }}
        >
          Add
        </button>
      </div>
      <p className="subtle">
        Custom appliances match recipes requiring that exact appliance.
        Alternative methods appear only when the recipe includes their
        instructions. Saved “Hob” and “Oven” selections remain supported.
      </p>
    </div>
  );
}
