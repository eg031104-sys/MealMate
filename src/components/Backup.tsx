import { useState } from "react";
import type { State } from "../storage";
import { restoreState } from "../storage";
import { exportBackup, parseBackup } from "../v2-state";
export function downloadJSON(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Backup({
  state,
  onChange,
}: {
  state: State;
  onChange: (s: State) => void;
}) {
  const [pending, setPending] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  return (
    <section className="settings-card">
      <h2>Back up your kitchen</h2>
      <p>
        Export recipes, settings, all saved weeks, stock, purchase records and
        shopping changes. Keep the JSON file somewhere safe.
      </p>
      <button
        className="primary"
        onClick={() =>
          downloadJSON(
            exportBackup(state),
            `MealMate-backup-${state.week}.json`,
          )
        }
      >
        Export JSON backup
      </button>
      <label className="field">
        Restore a backup
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 25_000_000) throw Error("Backup exceeds 25 MB");
              setPending(parseBackup(await file.text()));
              setMessage(
                "Backup validated. Review the counts before restoring.",
              );
            } catch (error) {
              setPending(null);
              setMessage("Backup rejected: " + (error as Error).message);
            }
          }}
        />
      </label>
      {pending && (
        <div className="notice-block">
          <strong>
            {pending.recipes.length} recipes · {pending.plan.length} meal slots
            · {pending.v2.purchases.length} purchases
          </strong>
          <p>
            Restoring replaces the current household data. A recovery copy of
            the current data is retained in IndexedDB. Export your current
            backup first.
          </p>
          <div className="button-row">
            <button
              className="primary"
              onClick={async () => {
                try {
                  await restoreState(pending);
                  onChange(pending);
                  setPending(null);
                  setMessage("Backup restored and saved.");
                } catch (error) {
                  setMessage(
                    "Restore failed. Current data was retained. " +
                      (error as Error).message,
                  );
                }
              }}
            >
              Restore this backup
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      <p role="status" className="subtle">
        {message}
      </p>
    </section>
  );
}
