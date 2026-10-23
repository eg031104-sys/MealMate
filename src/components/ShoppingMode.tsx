import { useState } from "react";
import { Check, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import type { Ingredient, Meal, ShoppingItem } from "../domain";
import { quantity } from "../domain";
import type { State, Product } from "../v2-state";
import { decisionKey, mealLabel } from "../v2-state";
import {
  acknowledgeChanges,
  affectedMeals,
  aud,
  available,
  budget,
  changes,
  convertQuantity,
  inventory,
  pantryStatus,
  productFor,
  rankedRecipes,
  receipts,
  recommendation,
  recordPurchase,
  replaceMeal,
  requirements,
  sendToOtherShop,
  stapleSuggested,
  isStaple,
  substitute,
  substitutionOptions,
} from "../shopping";
const amount = (n: number, unit: string) =>
  n >= 1000 && unit !== "each"
    ? `${Number((n / 1000).toFixed(3))} ${unit === "g" ? "kg" : "L"}`
    : quantity(n, unit);
type Props = { state: State; onChange: (s: State) => void };
export function BudgetCard({ state, onChange }: Props) {
  const b = budget(state);
  const previous = budget(
    state,
    state.v2.baseline[state.week] ?? requirements(state),
  );
  const difference = b.total - previous.total;
  return (
    <section
      className={
        "budget-card " +
        (b.remaining !== null && b.remaining < 0 ? "over-budget" : "")
      }
    >
      <div>
        <span className="eyebrow">
          {b.partial ? "PARTIAL ESTIMATE" : "ESTIMATED SHOPPING COST"} · AUD
        </span>
        <p>Week beginning {state.week}</p>
        <h2>
          {aud(b.total)}
          <small>
            {b.limit != null ? ` / ${aud(b.limit)}` : " · no budget set"}
          </small>
        </h2>
        <p>
          {b.remaining === null
            ? "Set a budget for this week."
            : b.remaining < 0
              ? `${aud(-b.remaining)} over budget`
              : `${aud(b.remaining)} remaining${b.partial ? " against the known estimate" : ""}`}
        </p>
      </div>
      <label>
        Weekly budget
        <input
          aria-label="Weekly budget AUD"
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 200"
          value={b.limit ?? ""}
          onChange={(e) =>
            onChange({
              ...state,
              v2: {
                ...state.v2,
                budgets: {
                  ...state.v2.budgets,
                  [state.week]:
                    e.target.value === "" ? null : Math.max(0, +e.target.value),
                },
              },
            })
          }
        />
      </label>
      {Math.abs(difference) > 0.005 && (
        <p className="budget-note">
          Plan change since acknowledged list: {difference > 0 ? "+" : "−"}
          {aud(Math.abs(difference))}
          {b.partial || previous.partial ? " (partial comparison)" : ""}.
        </p>
      )}
      <p className="budget-note">
        Includes recorded purchases for this week plus outstanding package
        purchases.{" "}
        {b.demoUsed
          ? "Demonstration prices and example pack sizes — not current supermarket prices. "
          : "User-entered or unpriced products. "}
        {b.missing > 0 &&
          `${b.missing} prices or planned recipe details are missing. `}
        {b.uncertain > 0 &&
          `${b.uncertain} pantry items still need checking; their costs are excluded.`}
      </p>
    </section>
  );
}
function ProductEditor({
  state,
  onChange,
  item,
}: { item: ShoppingItem } & Props) {
  const existing = productFor(state, item);
  const [size, setSize] = useState(String(existing?.size ?? ""));
  const [price, setPrice] = useState(existing?.price?.toString() ?? "");
  const [shop, setShop] = useState(
    existing?.source === "user" ? (existing.shop ?? "") : "",
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState("");
  return (
    <details className="product-editor">
      <summary>Package size & price</summary>
      <p className="subtle">
        {existing?.source === "demo"
          ? "Current values are demonstration data. Save to use your own package and price."
          : "User-entered package information. Not live supermarket data."}
      </p>
      <div className="form-grid">
        <label>
          Package size ({item.unit})
          <input
            type="number"
            min="0.001"
            step="any"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </label>
        <label>
          Price per package (AUD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Shop (optional)
          <input value={shop} onChange={(e) => setShop(e.target.value)} />
        </label>
        <label>
          Product (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <button
        className="secondary"
        onClick={() => {
          if (
            !Number.isFinite(+size) ||
            +size <= 0 ||
            (price !== "" && (!Number.isFinite(+price) || +price < 0))
          ) {
            setError("Enter a positive package size and a valid price.");
            return;
          }
          const product: Product = {
            size: +size,
            price: price === "" ? undefined : +price,
            shop,
            name,
            source: "user",
          };
          onChange({
            ...state,
            v2: {
              ...state.v2,
              products: { ...state.v2.products, [item.key]: product },
            },
          });
          setError("Package saved.");
        }}
      >
        Save package
      </button>
      <p role="status">{error}</p>
    </details>
  );
}
function PurchaseForm({
  state,
  onChange,
  item,
}: { item: ShoppingItem } & Props) {
  const rec = recommendation(state, item);
  const [qty, setQty] = useState(String(rec.buy || item.quantity));
  const [unit, setUnit] = useState<string>(item.unit);
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="purchase-form">
      <h4>Record an actual purchase</h4>
      <p className="subtle">
        This adds a new purchase to stock. It does not mark any meal as cooked.
      </p>
      <div className="form-grid">
        <label>
          Actual quantity
          <input
            type="number"
            min="0.001"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {(item.unit === "g"
              ? ["g", "kg"]
              : item.unit === "ml"
                ? ["ml", "l"]
                : ["each"]
            ).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Total price paid (AUD, optional)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Use-by / expiry (optional)
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={prepared}
          onChange={(e) => setPrepared(e.target.checked)}
        />
        Already prepared / cooked (never assume raw meat is cooked)
      </label>
      <button
        className="primary"
        onClick={() => {
          try {
            const value = convertQuantity(+qty, unit, item.unit);
            if (value === undefined) throw Error("Incompatible units");
            onChange(
              recordPurchase(
                state,
                item,
                value,
                price === "" ? undefined : +price,
                expiry || undefined,
                prepared,
              ),
            );
            setMessage(
              "Purchase recorded. To correct it, edit the record below; do not record it again.",
            );
            setQty("");
            setPrice("");
          } catch (error) {
            setMessage((error as Error).message);
          }
        }}
      >
        Record purchase
      </button>
      <p role="status">{message}</p>
      {receipts(state, item.key).map((p) => (
        <div className="receipt" key={p.id}>
          <strong>
            ✓ Recorded {amount(p.quantity, p.unit)}
            {p.price !== undefined
              ? ` · ${aud(p.price)}`
              : " · price not entered"}
          </strong>
          <p className="subtle">
            {p.prepared ? "Prepared" : "Raw / unprepared"} ·{" "}
            {amount(p.consumed, p.unit)} consumed
          </p>
          <label>
            Correct this purchase quantity ({p.unit})
            <input
              type="number"
              min={Math.max(0.001, p.consumed)}
              step="any"
              defaultValue={p.quantity}
              onBlur={(e) => {
                const q = +e.target.value;
                if (Number.isFinite(q) && q > 0 && q >= p.consumed)
                  onChange({
                    ...state,
                    v2: {
                      ...state.v2,
                      purchases: state.v2.purchases.map((x) =>
                        x.id === p.id ? { ...x, quantity: q } : x,
                      ),
                    },
                  });
                else e.target.value = String(p.quantity);
              }}
            />
          </label>
          <label>
            Correct total price (AUD)
            <input
              type="number"
              min="0"
              step="0.01"
              defaultValue={p.price ?? ""}
              onBlur={(e) => {
                const value =
                  e.target.value === "" ? undefined : +e.target.value;
                if (
                  value === undefined ||
                  (Number.isFinite(value) && value >= 0)
                )
                  onChange({
                    ...state,
                    v2: {
                      ...state.v2,
                      purchases: state.v2.purchases.map((x) =>
                        x.id === p.id ? { ...x, price: value } : x,
                      ),
                    },
                  });
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}
function ReplacementPicker({
  state,
  onChange,
  meal,
  onDone,
}: { meal: Meal; onDone: () => void } & Props) {
  const [confirmed, setConfirmed] = useState(false);
  const current = budget(state);
  const options = rankedRecipes(state, meal, true)
    .filter((r) => r.id !== meal.recipeId)
    .map((r) => {
      try {
        const next = replaceMeal(state, meal, r, true);
        return { r, next, cost: budget(next) };
      } catch {
        return null;
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort(
      (a, b) => a.cost.missing - b.cost.missing || a.cost.total - b.cost.total,
    )
    .slice(0, 12);
  return (
    <div>
      <h3>Replace {mealLabel(meal, state.week)}</h3>
      <p className="subtle">
        {meal.people} people · {meal.appetite}× appetite. Sorted by estimated
        full-week shopping cost, including stock and packages.
      </p>
      {meal.locked && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I approve replacing this locked meal
        </label>
      )}
      {options.map(({ r, cost }) => (
        <button
          className="replacement-option"
          key={r.id}
          disabled={meal.locked && !confirmed}
          onClick={() => {
            onChange(replaceMeal(state, meal, r, confirmed));
            onDone();
          }}
        >
          <span>
            {r.emoji} {r.name}
            <small>
              Week estimate {aud(cost.total)}
              {cost.partial ? " (partial)" : ""} ·{" "}
              {cost.partial || current.partial
                ? "savings unconfirmed"
                : cost.total < current.total
                  ? `${aud(current.total - cost.total)} less`
                  : `${aud(cost.total - current.total)} more`}
            </small>
          </span>
          <span>Choose</span>
        </button>
      ))}
    </div>
  );
}
function Resolution({
  state,
  onChange,
  item,
  onClose,
}: { item: ShoppingItem; onClose: () => void } & Props) {
  const [step, setStep] = useState<"menu" | "alternative" | "meal" | "shop">(
    "menu",
  );
  const [meal, setMeal] = useState<Meal | null>(null);
  const [locked, setLocked] = useState(false);
  const [shop, setShop] = useState("");
  const [error, setError] = useState("");
  const affected = affectedMeals(state, item.key);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Resolve unavailable ingredient"
      >
        <div className="section-heading">
          <h2>Shop doesn’t have {item.name.toLowerCase()}</h2>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {step === "menu" ? (
          <div className="resolution-menu">
            <button onClick={() => setStep("alternative")}>
              A. Find an alternative ingredient
              <small>Only substitutions with appropriate instructions</small>
            </button>
            <button onClick={() => setStep("meal")}>
              B. Change an affected meal
              <small>Keep portions and all unrelated meals</small>
            </button>
            <button onClick={() => setStep("shop")}>
              C. Buy from another shop
              <small>Keep the outstanding requirement</small>
            </button>
          </div>
        ) : (
          <button
            className="text-button"
            onClick={() => {
              setStep("menu");
              setMeal(null);
            }}
          >
            ← All options
          </button>
        )}
        {step === "alternative" && (
          <>
            <p>
              Applies only to the affected meals listed below. Quantities stay
              the same.
            </p>
            {affected.some((m) => m.locked) && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={locked}
                  onChange={(e) => setLocked(e.target.checked)}
                />
                Approve substitution in affected locked meals
              </label>
            )}
            {substitutionOptions(state, item).map((option) => (
              <div className="notice-block" key={option.name}>
                <h3>{option.name}</h3>
                <p>{option.instructions}</p>
                <p className="subtle">
                  {available(
                    state,
                    `${option.name.toLowerCase()}|${item.unit}`,
                  )}{" "}
                  {item.unit} recorded on hand. Check packaging for allergens.
                </p>
                <button
                  className="primary"
                  disabled={affected.some((m) => m.locked) && !locked}
                  onClick={() => {
                    try {
                      onChange(substitute(state, item, option.name, locked));
                      onClose();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Approve substitution
                </button>
              </div>
            ))}
            {!substitutionOptions(state, item).length && (
              <p className="empty">
                No verified compatible substitution is available. Change an
                affected meal or buy from another shop.
              </p>
            )}
          </>
        )}
        {step === "meal" &&
          (meal ? (
            <ReplacementPicker
              state={state}
              onChange={onChange}
              meal={meal}
              onDone={onClose}
            />
          ) : (
            affected.map((m) => (
              <button
                className="replacement-option"
                key={`${m.day}/${m.category}`}
                onClick={() => setMeal(m)}
              >
                {mealLabel(m, state.week)} ·{" "}
                {state.recipes.find((r) => r.id === m.recipeId)?.name}
                {m.locked ? " · Locked" : ""}
              </button>
            ))
          ))}
        {step === "shop" && (
          <>
            <label className="field">
              Another supermarket or shop
              <input
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                placeholder="Enter a shop name"
              />
            </label>
            <button
              className="primary"
              onClick={() => {
                try {
                  onChange(sendToOtherShop(state, item.key, shop));
                  onClose();
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Keep on another shop’s list
            </button>
          </>
        )}
        {step !== "meal" && (
          <>
            <h3>Affected meals</h3>
            <ul>
              {affected.map((m) => (
                <li key={`${m.day}/${m.category}`}>
                  {mealLabel(m, state.week)} ·{" "}
                  {state.recipes.find((r) => r.id === m.recipeId)?.name}
                </li>
              ))}
            </ul>
          </>
        )}
        <p role="status">{error}</p>
      </section>
    </div>
  );
}
export function ShoppingMode({ state, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [resolution, setResolution] = useState<ShoppingItem | null>(null);
  const [cheaper, setCheaper] = useState<Meal | null>(null);
  const b = budget(state);
  const all = changes(state);
  const check = requirements(state).filter((i) => pantryStatus(state, i).check);
  const main = all.filter(
    (i) => !pantryStatus(state, i).check || i.change === "removed",
  );
  const visible = main.filter((i) => !onlyChanges || i.change !== "same");
  const setDecision = (i: ShoppingItem, action: "enough" | "shop") =>
    onChange({
      ...state,
      v2: {
        ...state.v2,
        decisions: {
          ...state.v2.decisions,
          [decisionKey(state, i.key)]: { action, quantity: i.quantity },
        },
      },
    });
  return (
    <div className="shopping-mode">
      <BudgetCard state={state} onChange={onChange} />
      {b.remaining !== null && b.remaining < 0 && (
        <details className="settings-card">
          <summary>Find cheaper meal alternatives</summary>
          <p>
            Choose the meal to change. Nothing changes until you approve a
            replacement.
          </p>
          {activePlanned(state).map((m) => (
            <button
              className="replacement-option"
              key={`${m.day}/${m.category}`}
              onClick={() => setCheaper(m)}
            >
              {mealLabel(m, state.week)} ·{" "}
              {state.recipes.find((r) => r.id === m.recipeId)?.name}
            </button>
          ))}
        </details>
      )}
      <div className="shopping-tools">
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
          />
          Show changes only
        </label>
        <button
          className="secondary"
          onClick={() => onChange(acknowledgeChanges(state))}
        >
          Acknowledge changes
        </button>
        <button
          className="secondary"
          onClick={() => onChange(acknowledgeChanges(state))}
        >
          New shopping session
        </button>
        <button
          className="secondary"
          onClick={() => onChange({ ...state, checked: [] })}
        >
          Reset collected ticks
        </button>
      </div>
      <p className="subtle">
        ✓ Collected tick and purchase quantities are separate. Record quantities
        to update inventory. Blue + = new/increased; grey − = no longer needed.
      </p>
      {check.length > 0 && (
        <section className="pantry-check">
          <h2>
            Check your pantry <span>{check.length}</span>
          </h2>
          {check
            .filter(
              (i) =>
                !onlyChanges ||
                all.find((c) => c.key === i.key)?.change !== "same",
            )
            .map((i) => {
              const status = pantryStatus(state, i);
              const stock = state.v2.stock[i.key];
              return (
                <div className="pantry-check-row" key={i.key}>
                  <strong>{i.name}</strong>
                  <span>{amount(i.quantity, i.unit)} needed in total</span>
                  <small>
                    {stock?.quantity === null ||
                    (!stock && available(state, i.key) === 0)
                      ? "Quantity on hand unknown"
                      : `${amount(available(state, i.key), i.unit)} recorded on hand`}
                  </small>
                  {status.confirmed && (
                    <span className="confirmed">
                      <Check size={16} />
                      Enough confirmed for this quantity
                    </span>
                  )}
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => setDecision(i, "enough")}
                    >
                      Have enough
                    </button>
                    <button
                      className="primary"
                      onClick={() => setDecision(i, "shop")}
                    >
                      Add to shopping list
                    </button>
                  </div>
                  <label className="stock-inline">
                    Opening stock estimate ({i.unit}, excludes purchases)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Unknown"
                      defaultValue={stock?.quantity ?? ""}
                      onBlur={(e) => {
                        if (
                          e.target.value !== "" &&
                          (!Number.isFinite(+e.target.value) ||
                            +e.target.value < 0)
                        )
                          return;
                        onChange({
                          ...state,
                          v2: {
                            ...state.v2,
                            stock: {
                              ...state.v2.stock,
                              [i.key]: {
                                name: i.name,
                                unit: i.unit,
                                department: i.department,
                                quantity:
                                  e.target.value === ""
                                    ? null
                                    : +e.target.value + (stock?.consumed ?? 0),
                                consumed: stock?.consumed ?? 0,
                                prepared: stock?.prepared ?? false,
                                expiry: stock?.expiry,
                              },
                            },
                          },
                        });
                      }}
                    />
                  </label>
                </div>
              );
            })}
        </section>
      )}
      {[
        ...new Set(
          visible.map((i) =>
            state.v2.otherShops[decisionKey(state, i.key)]
              ? `Another shop: ${state.v2.otherShops[decisionKey(state, i.key)]}`
              : i.department,
          ),
        ),
      ].map((group) => (
        <section className="compact-department" key={group}>
          <h2>{group}</h2>
          {visible
            .filter(
              (i) =>
                (state.v2.otherShops[decisionKey(state, i.key)]
                  ? `Another shop: ${state.v2.otherShops[decisionKey(state, i.key)]}`
                  : i.department) === group,
            )
            .map((i) => {
              const rec = recommendation(state, i),
                inv = inventory(state, i.key, i.quantity),
                recorded = receipts(state, i.key);
              const checked = state.checked.includes(i.key);
              return (
                <article
                  className={`compact-item change-${i.change}`}
                  key={i.key}
                >
                  <div className="compact-summary">
                    <label className="purchase-check">
                      <input
                        aria-label={`Collected ${i.name}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChange({
                            ...state,
                            checked: checked
                              ? state.checked.filter((k) => k !== i.key)
                              : [...state.checked, i.key],
                          })
                        }
                      />
                    </label>
                    <button
                      className="expand-item"
                      aria-expanded={expanded === i.key}
                      onClick={() =>
                        setExpanded(expanded === i.key ? null : i.key)
                      }
                    >
                      <span>
                        <strong>{i.name}</strong>
                        {i.change === "removed" ? (
                          <span className="change-label">
                            − No longer required · purchases kept
                          </span>
                        ) : (
                          <>
                            <span>
                              Buy {amount(rec.buy, i.unit)}
                              {rec.product
                                ? ` · ${rec.packs} pack${rec.packs === 1 ? "" : "s"}`
                                : " · package size unknown"}
                            </span>
                            <small>
                              {amount(i.quantity, i.unit)} needed
                              {inv.shortage > 0 && recorded.length > 0
                                ? ` · Short ${amount(inv.shortage, i.unit)}`
                                : ""}
                            </small>
                          </>
                        )}
                        {i.change === "new" || i.change === "increased" ? (
                          <small className="change-label">
                            +{" "}
                            {i.change === "new"
                              ? "New requirement"
                              : `Increased from ${amount(i.previous, i.unit)}`}
                          </small>
                        ) : i.change === "reduced" ? (
                          <small>
                            ↓ Reduced from {amount(i.previous, i.unit)}
                          </small>
                        ) : null}
                        {(checked || recorded.length > 0) && (
                          <small className="confirmed">
                            ✓{" "}
                            {recorded.length
                              ? "Purchase recorded"
                              : "Collected — quantity not recorded"}
                          </small>
                        )}
                      </span>
                      {expanded === i.key ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                  </div>
                  {expanded === i.key && (
                    <div className="expanded-item">
                      <p>
                        <strong>{amount(i.quantity, i.unit)} required</strong> ·
                        Recommended purchase {amount(rec.buy, i.unit)}
                      </p>
                      <p className="subtle">
                        {rec.product
                          ? `${rec.product.source === "demo" ? "Example pack (demonstration only)" : "Your package"}: ${amount(rec.product.size, i.unit)} · ${rec.product.price === undefined ? "No price" : aud(rec.product.price)} · ${rec.product.shop ?? "Shop not specified"} ${rec.product.name ?? ""}`
                          : "No product information. Set your own package size and price."}
                      </p>
                      <div className="inventory-strip">
                        <span>
                          Purchased
                          <br />
                          <strong>{amount(inv.purchased, i.unit)}</strong>
                        </span>
                        <span>
                          Reserved
                          <br />
                          <strong>{amount(inv.reserved, i.unit)}</strong>
                        </span>
                        <span>
                          Surplus
                          <br />
                          <strong>{amount(inv.available, i.unit)}</strong>
                        </span>
                      </div>
                      {inv.shortage > 0 && recorded.length > 0 && (
                        <p className="shortage">
                          <AlertTriangle size={16} />
                          Short {amount(inv.shortage, i.unit)}. Affected:{" "}
                          {affectedMeals(state, i.key)
                            .map((m) => mealLabel(m, state.week))
                            .join(", ")}
                          . Meals have not changed.
                        </p>
                      )}
                      <ProductEditor
                        key={`product-${i.key}`}
                        state={state}
                        onChange={onChange}
                        item={i}
                      />
                      <PurchaseForm
                        key={`purchase-${i.key}`}
                        state={state}
                        onChange={onChange}
                        item={i}
                      />
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={isStaple(state, i.name)}
                          onChange={(e) =>
                            onChange({
                              ...state,
                              v2: {
                                ...state.v2,
                                staples: {
                                  ...state.v2.staples,
                                  [i.name.toLowerCase()]: e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        Pantry staple
                        {stapleSuggested(state, i.name)
                          ? " · Suggested from ingredient / purchase history"
                          : ""}
                      </label>
                      <button
                        className="secondary"
                        onClick={() => setResolution(i)}
                      >
                        Shop doesn’t have this item
                      </button>
                      {state.v2.otherShops[decisionKey(state, i.key)] && (
                        <button
                          className="text-button"
                          onClick={() => {
                            const otherShops = { ...state.v2.otherShops };
                            delete otherShops[decisionKey(state, i.key)];
                            onChange({
                              ...state,
                              v2: { ...state.v2, otherShops },
                            });
                          }}
                        >
                          Return to main shop
                        </button>
                      )}
                      <h4>Recipes using this ingredient</h4>
                      <ul>
                        {affectedMeals(state, i.key).map((m) => (
                          <li key={`${m.day}/${m.category}`}>
                            {mealLabel(m, state.week)} ·{" "}
                            {
                              state.recipes.find((r) => r.id === m.recipeId)
                                ?.name
                            }
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
        </section>
      ))}
      {!visible.length && (
        <p className="empty">
          {onlyChanges
            ? "No outstanding changes."
            : "Nothing on the main shopping list. Check the pantry section above."}
        </p>
      )}
      {resolution && (
        <Resolution
          state={state}
          onChange={onChange}
          item={resolution}
          onClose={() => setResolution(null)}
        />
      )}
      {cheaper && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cheaper meals"
          >
            <button className="secondary" onClick={() => setCheaper(null)}>
              Close
            </button>
            <ReplacementPicker
              state={state}
              onChange={onChange}
              meal={cheaper}
              onDone={() => setCheaper(null)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
function activePlanned(state: State) {
  return state.plan.filter((m) => m.recipeId && !m.cooked);
}
