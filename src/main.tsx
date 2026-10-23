import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Heart,
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingBasket,
  Package,
  Settings as SettingsIcon,
  Leaf,
  ChevronRight,
  Plus,
  ArrowUpRight,
  RefreshCw,
  LockKeyhole,
  LockKeyholeOpen,
  Clock,
  Users,
  X,
  Sparkles,
  Utensils,
  Download,
  Store,
  Recycle,
} from "lucide-react";
import {
  categories,
  defaults,
  matches,
  scaleQuantity,
  quantity,
} from "./domain";
import type { Meal, Recipe } from "./domain";
import { starterRecipes } from "./recipes";
import { loadState, saveState, readRawState } from "./storage";
import type { State } from "./storage";
import "./style.css";
import "./v2.css";
import "./v3.css";
import {
  emptyV2,
  migrateState,
  enabledCategories,
  setDayCategories,
  switchWeek,
  dateForDay,
} from "./v2-state";
import { upgradeCatalogue } from "./genuine-recipes";
import { discoverable } from "./catalogue";
import { PlanningPreferences } from "./components/PlanningPreferences";
import { MyMeals } from "./components/MyMeals";
import { RecipeControls } from "./components/RecipeControls";
import { confirmCooked } from "./meal-history";
import { planningWeekStart } from "./weekly-planner";
import { planningSettings } from "./planning-model";
import { today } from "./shopping";
import "./planning.css";
import { MeasurementSettings } from "./components/MeasurementSettings";
import { Supermarkets, StoreSelector } from "./components/Supermarkets";
import { selectedStore } from "./supermarkets";
import { HouseholdServings } from "./components/HouseholdServings";
import { Leftovers } from "./components/Leftovers";
import { RecipePhoto, PhotoCredit } from "./components/RecipePhoto";
import { NumericInput } from "./components/NumericInput";
import {
  acknowledgeChanges,
  requirements,
  rankedRecipes,
  replaceMeal,
  pantryStatus,
  recommendation,
} from "./shopping";
import { Appliances } from "./components/Appliances";
import { Backup, downloadJSON } from "./components/Backup";
import { RecipeLibrary } from "./components/RecipeLibrary";
import { ShoppingMode, BudgetCard } from "./components/ShoppingMode";
import { Pantry } from "./components/Pantry";
import { cookingMethod, usable } from "./domain";
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Meal Planner", CalendarDays],
  ["Recipes", BookOpen],
  ["My Meals", Heart],
  ["Shopping List", ShoppingBasket],
  ["Pantry", Package],
  ["Use Up Leftovers", Recycle],
  ["Supermarkets", Store],
  ["Settings", SettingsIcon],
] as const;
function monday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayDate(week: string, day: number) {
  const d = new Date(`${week}T12:00:00`);
  d.setDate(d.getDate() + day);
  return d;
}
function fresh(): State {
  return acknowledgeChanges({
    settings: defaults,
    recipes: upgradeCatalogue(starterRecipes),
    plan: [],
    checked: [],
    pantry: [],
    week: monday(),
    v2: emptyV2(),
  });
}
export function App() {
  const [state, setState] = useState<State | null>(null);
  const [page, setPage] = useState("Dashboard");
  const [planningOpen, setPlanningOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [detail, setDetail] = useState<{ recipe: Recipe; meal?: Meal } | null>(
    null,
  );
  const [selectMeal, setSelectMeal] = useState<Meal | null>(null);
  const [day, setDay] = useState(0);
  const [daySettings, setDaySettings] = useState(false);
  const [detailPeople, setDetailPeople] = useState(2);
  const [detailAppetite, setDetailAppetite] = useState(1);
  useEffect(() => {
    if (detail) {
      setDetailPeople(detail.meal?.people ?? (detail.recipe.servings || 2));
      setDetailAppetite(detail.meal?.appetite ?? 1);
    }
  }, [detail]);
  const [install, setInstall] = useState<any>(null);
  useEffect(() => {
    loadState()
      .then((s) => {
        let next = s
          ? {
              ...s,
              recipes: upgradeCatalogue(
                s.recipes,
                s.settings.measurementOverrides,
              ),
            }
          : fresh();
        if (!next.v2.baseline[next.week]) next = acknowledgeChanges(next);
        setState(migrateState(next));
        setLoaded(true);
      })
      .catch(() => {
        setState(fresh());
        setLoadError(true);
        setStatus(
          "Your saved data could not be opened. It has not been overwritten. This temporary view will not save changes; export any recovery data or restore a valid backup in Settings.",
        );
      });
    const blocked = () =>
      setStatus(
        "Close other MealMate tabs or windows to finish the database upgrade. Your saved data is retained.",
      );
    window.addEventListener("mealmate-db-blocked", blocked);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("mealmate-db-blocked", blocked);
    };
  }, []);
  useEffect(() => {
    if (state && loaded) {
      saveState(state).catch(() =>
        setStatus("Could not save changes. Check available device storage."),
      );
    }
  }, [state, loaded]);
  if (!state)
    return (
      <div className="loading">
        <Leaf /> {status || "Preparing your kitchen…"}
      </div>
    );
  const s = state.settings;
  const update = (patch: Partial<State>) =>
    setState((old) => (old ? { ...old, ...patch } : old));
  const settings = (patch: Partial<typeof s>) =>
    update({ settings: { ...s, ...patch } });
  const dailyCategories = enabledCategories(state, day);
  const list = requirements(state);
  const planned = state.plan.filter(
    (m) => enabledCategories(state, m.day).includes(m.category) && m.recipeId,
  );
  const toBuy = list.filter(
    (i) =>
      !state.checked.includes(i.key) &&
      !pantryStatus(state, i).check &&
      recommendation(state, i).shortage > 0,
  ).length;
  const changeMeal = (meal: Meal, patch: Partial<Meal>) =>
    update({
      plan: state.plan.map((m) =>
        m.day === meal.day && m.category === meal.category
          ? {
              ...m,
              ...patch,
              ...(patch.recipeId !== undefined
                ? { substitutions: undefined, cooked: false }
                : {}),
            }
          : m,
      ),
    });
  const regenerate = () => {
    setPlanningOpen(true);
    setPage("Meal Planner");
  };
  const swap = (meal: Meal) => {
    const options = rankedRecipes(state, meal).filter(
      (r) => r.id !== meal.recipeId,
    );
    const fresh = options.find(
      (r) => !state.plan.some((m) => m.recipeId === r.id),
    );
    const r = fresh ?? options[0];
    if (!r) {
      setStatus(
        "No other matching recipe. Try adjusting this week's planning preferences.",
      );
      return;
    }
    try {
      setState(replaceMeal(state, meal, r));
      if (!fresh)
        setStatus(
          "This recipe already appears this week; no unused eligible alternative was available.",
        );
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const weekLabel = `${dayDate(state.week, 0).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${dayDate(state.week, 6).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
  const mealCard = (meal: Meal) => {
    const r = state.recipes.find((r) => r.id === meal.recipeId);
    return (
      <article className="meal-card" key={`${meal.day}-${meal.category}`}>
        <div className="meal-top">
          <span className="eyebrow">{meal.category}</span>
          <button
            aria-label={meal.locked ? "Unlock meal" : "Lock meal"}
            className={"icon-button " + (meal.locked ? "locked" : "")}
            onClick={() => changeMeal(meal, { locked: !meal.locked })}
          >
            {meal.locked ? (
              <LockKeyhole size={16} />
            ) : (
              <LockKeyholeOpen size={16} />
            )}
          </button>
        </div>
        {r ? (
          <>
            <button
              className="meal-photo-button"
              onClick={() => setDetail({ recipe: r, meal })}
            >
              <RecipePhoto recipe={r} />
            </button>
            <button
              className="recipe-title"
              onClick={() => setDetail({ recipe: r, meal })}
            >
              {r.name}
            </button>
            {!usable(r) && (
              <small className="shortage">
                Review required — excluded from shopping
              </small>
            )}
            <RecipeControls recipe={r} state={state} onChange={setState} />
            <div className="meta">
              <Clock size={14} />
              {r.prep + r.cook + (r.wait ?? 0)} min <span>·</span>
              <Users size={14} />
              {meal.people} people
            </div>
          </>
        ) : (
          <button className="empty-slot" onClick={() => setSelectMeal(meal)}>
            <Plus />
            Choose a recipe
          </button>
        )}
        <div className="portion-row">
          <label>
            People
            <NumericInput
              aria-label={`${meal.category} people`}
              value={meal.people}
              min={1}
              max={12}
              integer
              onCommit={(n) =>
                changeMeal(meal, { people: n, portionOverride: true })
              }
            />
          </label>
          <label>
            Appetite
            <NumericInput
              aria-label={`${meal.category} appetite`}
              value={meal.appetite}
              min={0.75}
              max={2.5}
              onCommit={(n) =>
                changeMeal(meal, { appetite: n, portionOverride: true })
              }
            />
          </label>
        </div>
        <div className="card-actions">
          <button
            disabled={meal.locked || meal.cooked}
            onClick={() => swap(meal)}
          >
            <RefreshCw size={14} />
            Swap
          </button>
          <button
            disabled={meal.locked || meal.cooked}
            onClick={() => setSelectMeal(meal)}
          >
            Choose
            <ChevronRight size={14} />
          </button>
        </div>
        {meal.recipeId && (
          <div className="meal-cooked">
            <button className="text-button" onClick={() => setPage("My Meals")}>
              History / confirm cooking
            </button>
            <button
              className="text-button"
              disabled={meal.cooked}
              onClick={() => {
                try {
                  setState(
                    confirmCooked(state, state.week, meal, today(), true),
                  );
                  setStatus(
                    "Meal marked cooked. Recorded stock was consumed and reservations released.",
                  );
                } catch (error) {
                  setStatus((error as Error).message);
                }
              }}
            >
              {meal.cooked
                ? "✓ Confirmed cooked"
                : "Mark cooked & consume stock"}
            </button>
          </div>
        )}
      </article>
    );
  };
  const recipeCards = (recipes: Recipe[]) =>
    recipes.map((r) => (
      <article key={r.id} className="library-card">
        <button
          className="library-open"
          onClick={() =>
            selectMeal
              ? (setState(replaceMeal(state, selectMeal, r)),
                setSelectMeal(null))
              : setDetail({ recipe: r })
          }
        >
          <RecipePhoto recipe={r} />
          <div className="library-body">
            <span className="eyebrow">{r.category}</span>
            <h3>{r.name}</h3>
            <div className="meta">
              <Clock size={14} />
              {r.prep + r.cook + (r.wait ?? 0)} min <span>·</span>
              {r.servings} serves
            </div>
            <div className="tags">
              {r.diet.slice(0, 2).map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </button>
        <RecipeControls recipe={r} state={state} onChange={setState} />
      </article>
    ));
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Dashboard");
          }}
        >
          <span className="brand-mark">
            <Utensils size={23} />
          </span>
          meal<span>mate</span>
          <i>®</i>
        </a>
        <div className="sidebar-caption">A LITTLE PLAN. A LOT OF GOOD.</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => {
                setPage(name);
              }}
            >
              <Icon size={20} />
              <span>{name}</span>
              {name === "Shopping List" && <small>{toBuy}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />
            Your kitchen, your data<small>Saved on this device</small>
          </div>
          <button className="household" onClick={() => setPage("Settings")}>
            <span className="avatar">H</span>
            <span>
              My household
              <small>
                {s.people} people · {s.appetite}× appetite
              </small>
            </span>
            <SettingsIcon size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            <span className="breadcrumb">My kitchen</span>
            <ChevronRight size={14} />
            {page}
          </span>
          <span className="top-right">
            <span className="local-pill">
              <span className="status-dot" />
              Local & private
            </span>
            <button
              className="avatar"
              aria-label="Household settings"
              onClick={() => setPage("Settings")}
            >
              H
            </button>
          </span>
        </header>
        <main>
          <div className="heading">
            <div>
              <span className="eyebrow green">
                YOUR EVERYDAY, A LITTLE EASIER
              </span>
              <h1>
                {page === "Dashboard"
                  ? "Your week, well fed."
                  : page === "Meal Planner"
                    ? "A good week starts here."
                    : page === "My Meals"
                      ? "Your meals, remembered."
                      : page === "Recipes"
                        ? "Good food. On repeat."
                        : page === "Shopping List"
                          ? "A little list. All sorted."
                          : page === "Use Up Leftovers"
                            ? "Good food deserves another meal."
                            : page === "Supermarkets"
                              ? "Your shop. Your plan."
                              : page === "Pantry"
                                ? "Know what’s in your kitchen."
                                : "Make yourself at home."}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Less “what’s for dinner?”, more time around the table."
                  : page === "Meal Planner"
                    ? "Seven days of meals, made to fit your household."
                    : page === "My Meals"
                      ? "Confirmed cooking history and your favourite recipes."
                      : page === "Recipes"
                        ? "Simple ingredients. Original recipes. Something for everyone."
                        : page === "Shopping List"
                          ? "Everything your meal plan needs, neatly brought together."
                          : page === "Use Up Leftovers"
                            ? "Good food deserves another meal."
                            : page === "Supermarkets"
                              ? "Your shop. Your plan."
                              : page === "Pantry"
                                ? "Keep a simple checklist of ingredients you already have."
                                : "Your people, your preferences, your kind of cooking."}
              </p>
            </div>

            {(page === "Dashboard" || page === "Meal Planner") && (
              <button className="primary" onClick={regenerate}>
                <Sparkles size={17} />
                Plan My Meals
              </button>
            )}
          </div>
          {(page === "Dashboard" ||
            (page === "Meal Planner" && !planningOpen)) && (
            <>
              <StoreSelector state={state} onChange={setState} compact />
              <button
                className="text-button"
                onClick={() => setPage("Supermarkets")}
              >
                Manage supermarkets, stores & products ↗
              </button>
            </>
          )}
          {loadError && (
            <div className="notice-block">
              <strong>Saved data is protected from automatic writes.</strong>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    downloadJSON(
                      JSON.stringify(
                        {
                          format: "mealmate-raw-recovery",
                          state: await readRawState(),
                        },
                        null,
                        2,
                      ),
                      "MealMate-original-recovery.json",
                    );
                  } catch (e) {
                    setStatus(
                      "Could not read original data: " + (e as Error).message,
                    );
                  }
                }}
              >
                Download original saved data
              </button>
            </div>
          )}
          {status && (
            <div className="notice" role="status">
              {status}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setStatus("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Dashboard" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">A CALMER KITCHEN STARTS HERE</span>
                  <h2>
                    A little planning.
                    <br />A lot of good food.
                  </h2>
                  <p>
                    Meals that fit your family, a shopping list that
                    <br className="desktop" /> makes sense, and one less thing
                    to think about.
                  </p>
                  <button className="light-button" onClick={regenerate}>
                    Plan My Meals
                    <ArrowUpRight size={18} />
                  </button>
                  <span className="hero-foot">
                    <Leaf size={14} /> Thoughtful meals. Happier households.
                  </span>
                </div>
                <div className="hero-illustration" aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <div className="plate">
                    <div className="salad">🥗</div>
                    <span className="plate-leaf">🌿</span>
                  </div>
                  <div className="float-note">
                    <span>✓</span> A fresh week ahead
                  </div>
                  <span className="deco-leaf">✳</span>
                </div>
              </section>
              <div className="stat-grid">
                <button
                  className="stat"
                  onClick={() => setPage("Meal Planner")}
                >
                  <span className="stat-icon mint">
                    <CalendarDays />
                  </span>
                  <div>
                    <small>On the menu</small>
                    <strong>
                      {planned.length}
                      <span> meals planned</span>
                    </strong>
                  </div>
                  <ChevronRight size={18} />
                </button>
                <button
                  className="stat"
                  onClick={() => setPage("Shopping List")}
                >
                  <span className="stat-icon peach">
                    <ShoppingBasket />
                  </span>
                  <div>
                    <small>Your shopping list</small>
                    <strong>
                      {toBuy}
                      <span> items to pick up</span>
                    </strong>
                  </div>
                  <ChevronRight size={18} />
                </button>
                <button className="stat" onClick={() => setPage("Recipes")}>
                  <span className="stat-icon lavender">
                    <BookOpen />
                  </span>
                  <div>
                    <small>A little inspiration</small>
                    <strong>
                      {
                        state.recipes.filter(
                          (r) => discoverable(r) && usable(r),
                        ).length
                      }
                      <span> recipes to explore</span>
                    </strong>
                  </div>
                  <ChevronRight size={18} />
                </button>
              </div>
            </>
          )}
          {page === "Meal Planner" && planningOpen && (
            <PlanningPreferences
              key={state.week}
              state={state}
              onChange={setState}
              onDone={(message) => {
                setPlanningOpen(false);
                setStatus(message);
              }}
              onCancel={() => setPlanningOpen(false)}
              onStores={() => setPage("Supermarkets")}
            />
          )}
          {(page === "Dashboard" ||
            (page === "Meal Planner" && !planningOpen)) && (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    {page === "Dashboard" ? "On the menu" : "Your weekly menu"}
                    <span className="week-chip">
                      {state.week === monday() ? "THIS WEEK" : "SAVED WEEK"}
                    </span>
                  </h2>
                  <p>{weekLabel}</p>
                </div>
                {page === "Dashboard" ? (
                  <button
                    className="text-button"
                    onClick={() => setPage("Meal Planner")}
                  >
                    View full planner
                    <ArrowUpRight size={16} />
                  </button>
                ) : (
                  <button className="text-button" onClick={regenerate}>
                    Planning preferences
                    <SettingsIcon size={16} />
                  </button>
                )}
              </div>
              {state.planning?.weeks[state.week] && (
                <p className="subtle">
                  This week: {planningSettings(state).people} people ·{" "}
                  {planningSettings(state).appetite}× appetite. Individual
                  portions and day switches take precedence.
                </p>
              )}
              {state.planning?.reports[state.week]?.map((message) => (
                <p className="notice" key={message}>
                  {message}
                </p>
              ))}
              <label className="planner-week">
                Planning week
                <input
                  aria-label="Planner week"
                  type="date"
                  value={state.week}
                  onChange={(e) => {
                    if (e.target.value)
                      setState(
                        switchWeek(state, planningWeekStart(e.target.value)),
                      );
                  }}
                />
              </label>
              <div className="week-tabs">
                {Array.from({ length: 7 }, (_, i) => (
                  <button
                    key={i}
                    aria-label={dayDate(state.week, i).toLocaleDateString(
                      "en-AU",
                      { weekday: "long", day: "numeric", month: "long" },
                    )}
                    onClick={() => {
                      setDay(i);
                      setDaySettings(true);
                    }}
                    className={i === day ? "selected" : ""}
                  >
                    <span>
                      {dayDate(state.week, i).toLocaleDateString("en-AU", {
                        weekday: "short",
                      })}
                    </span>
                    <strong>{dayDate(state.week, i).getDate()}</strong>
                    <i
                      className={
                        state.plan.some((m) => m.day === i && m.locked)
                          ? "has-lock"
                          : ""
                      }
                    />
                  </button>
                ))}
              </div>
              {daySettings && (
                <section
                  className="day-settings settings-card"
                  aria-label="Daily meal settings"
                >
                  <div className="section-heading">
                    <div>
                      <h3>
                        Meals for{" "}
                        {dayDate(state.week, day).toLocaleDateString("en-AU", {
                          weekday: "long",
                        })}
                      </h3>
                      <small>
                        {state.v2.daily[dateForDay(state.week, day)]
                          ? "Custom daily settings"
                          : "Using weekly defaults"}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setDaySettings(false)}
                    >
                      Done
                    </button>
                  </div>
                  <div className="daily-switches">
                    {categories.map((c) => (
                      <label key={c} className="switch-row">
                        <span>{c}</span>
                        <input
                          role="switch"
                          type="checkbox"
                          checked={dailyCategories.includes(c)}
                          onChange={() =>
                            setState(
                              setDayCategories(
                                state,
                                day,
                                dailyCategories.includes(c)
                                  ? dailyCategories.filter((x) => x !== c)
                                  : [...dailyCategories, c],
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setState(setDayCategories(state, day, null))}
                  >
                    Reset this day to weekly defaults
                  </button>
                  <p className="subtle">
                    Only this day changes. Disabled meals, portions and locks
                    are kept.
                  </p>
                </section>
              )}
              <div className="day-title">
                <h3>
                  {dayDate(state.week, day).toLocaleDateString("en-AU", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
                <span>
                  {dailyCategories.length} meals · made for{" "}
                  {planningSettings(state).people}
                </span>
              </div>
              <div className="meal-grid">
                {dailyCategories.map((category) => {
                  const meal = state.plan.find(
                    (m) => m.day === day && m.category === category,
                  ) ?? {
                    day,
                    category,
                    recipeId: null,
                    people: planningSettings(state).people,
                    appetite: planningSettings(state).appetite,
                    locked: false,
                  };
                  if (
                    !state.plan.some(
                      (m) => m.day === day && m.category === category,
                    )
                  )
                    return (
                      <button
                        className="add-slot"
                        key={category}
                        onClick={() => update({ plan: [...state.plan, meal] })}
                      >
                        <Plus />
                        {category}: add meal slot
                      </button>
                    );
                  return mealCard(meal);
                })}
              </div>
              {dailyCategories.length === 0 && (
                <p className="empty">
                  Tap this day to enable a meal category, or change your weekly
                  defaults in Settings.
                </p>
              )}
              <div className="tip">
                <Leaf size={22} />
                <div>
                  <strong>A small plan makes a big difference.</strong>
                  <p>
                    Check your pantry before shopping. A few ingredients might
                    already be waiting for you.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setPage("Pantry")}
                >
                  Open pantry
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === "My Meals" && (
            <MyMeals
              state={state}
              onChange={setState}
              onOpen={(r) => setDetail({ recipe: r })}
            />
          )}
          {page === "Recipes" && (
            <RecipeLibrary
              state={state}
              onChange={setState}
              onOpen={(r) => setDetail({ recipe: r })}
            />
          )}
          {page === "Shopping List" && (
            <ShoppingMode state={state} onChange={setState} />
          )}
          {page === "Pantry" && <Pantry state={state} onChange={setState} />}
          {page === "Supermarkets" && (
            <Supermarkets state={state} onChange={setState} />
          )}
          {page === "Use Up Leftovers" && (
            <Leftovers
              state={state}
              onChange={setState}
              onPantry={() => setPage("Pantry")}
            />
          )}
          {page === "Settings" && (
            <>
              <div className="settings-grid">
                <section className="settings-card">
                  <h2>
                    <Users size={20} />
                    Your household
                  </h2>
                  <HouseholdServings
                    key={state.week}
                    state={state}
                    onChange={setState}
                  />
                  <label className="field">
                    Week beginning
                    <input
                      type="date"
                      value={state.week}
                      onChange={(e) => {
                        if (e.target.value) {
                          let next = switchWeek(
                            state,
                            planningWeekStart(e.target.value),
                          );
                          if (!next.v2.baseline[next.week])
                            next = acknowledgeChanges(next);
                          setState(next);
                        }
                      }}
                    />
                  </label>
                  <p className="subtle">
                    Each saved week keeps its plan, daily overrides, budget and
                    shopping state. Inventory and purchases remain in your
                    household ledger. Reservations on screen are for the
                    selected week.
                  </p>
                </section>
                <section className="settings-card">
                  <h2>
                    <Leaf size={20} />
                    Food preferences
                  </h2>
                  <span className="field-label">Dietary requirements</span>
                  {["Vegetarian", "Vegan", "Gluten-free", "Dairy-free"].map(
                    (d) => (
                      <label className="check-row" key={d}>
                        <input
                          type="checkbox"
                          checked={s.diet.includes(d)}
                          onChange={() =>
                            settings({
                              diet: s.diet.includes(d)
                                ? s.diet.filter((x) => x !== d)
                                : [...s.diet, d],
                            })
                          }
                        />
                        {d}
                      </label>
                    ),
                  )}
                  <label className="field">
                    Disliked ingredients
                    <input
                      value={s.dislikes}
                      placeholder="e.g. mushrooms, tuna"
                      onChange={(e) => settings({ dislikes: e.target.value })}
                    />
                    <small>Separate ingredients with commas.</small>
                  </label>
                  <label className="field">
                    Allergens to exclude
                    <input
                      defaultValue={state.v2.allergies.join(", ")}
                      placeholder="e.g. peanut, milk"
                      onBlur={(e) =>
                        update({
                          v2: {
                            ...state.v2,
                            allergies: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                    />
                  </label>
                  <p className="subtle">
                    Ingredient-name exclusions supplement dietary tags. Check
                    ingredient packaging and imported recipes for allergens;
                    unlisted traces are not detectable.
                  </p>
                </section>
                <MeasurementSettings state={state} onChange={setState} />
                <section className="settings-card">
                  <h2>
                    <Utensils size={20} />
                    Your kitchen
                  </h2>
                  <Appliances
                    selected={s.appliances}
                    onChange={(appliances) => settings({ appliances })}
                  />
                  <label className="field">
                    Maximum total cooking time
                    <select
                      value={s.maxTime}
                      onChange={(e) => settings({ maxTime: +e.target.value })}
                    >
                      {[15, 20, 30, 45, 60, 90, 120, 240, 480].map((n) => (
                        <option key={n} value={n}>
                          {n} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
                <section className="settings-card">
                  <h2>
                    <CalendarDays size={20} />
                    Weekly meal defaults
                  </h2>
                  {categories.map((c) => (
                    <label className="check-row" key={c}>
                      <input
                        type="checkbox"
                        checked={s.categories.includes(c)}
                        onChange={() =>
                          settings({
                            categories: s.categories.includes(c)
                              ? s.categories.filter((x) => x !== c)
                              : [...s.categories, c],
                          })
                        }
                      />
                      {c}
                    </label>
                  ))}
                  <p className="subtle">
                    Weeks with saved planning preferences keep their own
                    categories. Use Plan My Meals to change this week. Daily
                    overrides are preserved. Disabled meals are kept but
                    excluded from shopping. Changing defaults does not replace
                    recipes. Refresh applies only to enabled, unlocked meals.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      regenerate();
                      setPage("Meal Planner");
                    }}
                  >
                    <RefreshCw size={16} />
                    Apply to unlocked meals
                  </button>
                  {install && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        await install.prompt();
                        setInstall(null);
                      }}
                    >
                      <Download size={17} />
                      Install MealMate
                    </button>
                  )}
                  <p className="subtle">
                    MealMate v3 · stored locally on this browser.
                    <br />
                    Demonstration pricing. No configured AI provider.
                  </p>
                </section>
                <Backup
                  state={state}
                  onChange={(next) => {
                    setState(next);
                    setLoaded(true);
                    setLoadError(false);
                  }}
                />
              </div>
              <BudgetCard state={state} onChange={setState} />
            </>
          )}
          <footer>
            <Leaf size={14} />
            <span>A little less stress. A little more good food.</span>
            <span>Made for your everyday.</span>
          </footer>
        </main>
      </div>
      {(detail || selectMeal) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setDetail(null);
            setSelectMeal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail?.recipe.name ?? "Choose a recipe"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setDetail(null);
                setSelectMeal(null);
              }}
            >
              <X />
            </button>
            {detail ? (
              <>
                <RecipePhoto recipe={detail.recipe} large />
                <PhotoCredit recipe={detail.recipe} />
                <RecipeControls
                  recipe={detail.recipe}
                  state={state}
                  onChange={setState}
                />
                {detail.recipe.archived && (
                  <p className="notice">
                    Archived{" "}
                    {detail.recipe.origin === "ai"
                      ? "AI-authored starter"
                      : "legacy variation"}
                    . Saved meal references are kept; this recipe is excluded
                    from new normal planning.
                  </p>
                )}
                {!usable(detail.recipe) && (
                  <p className="notice">
                    Review required:{" "}
                    {detail.recipe.review?.join(" ") ||
                      "Incomplete ingredients or serving size."}{" "}
                    This recipe cannot generate a meal plan or shopping list.
                  </p>
                )}
                {detail.recipe.description && (
                  <p>{detail.recipe.description}</p>
                )}
                <span className="eyebrow green">{detail.recipe.category}</span>
                <h2>{detail.recipe.name}</h2>
                <p className="meta">
                  Prep {detail.recipe.prep} min · Cook {detail.recipe.cook} min
                  ·{" "}
                  {detail.meal
                    ? `${detail.meal.people} people · ${detail.meal.appetite}× appetite`
                    : `${detail.recipe.servings} standard serves`}
                </p>
                <div className="tags">
                  {detail.recipe.diet.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <p className="subtle">
                  Cooking method:{" "}
                  {(
                    cookingMethod(detail.recipe, planningSettings(state))
                      ?.appliances ?? detail.recipe.appliances
                  ).join(", ") || "No appliances"}
                </p>
                {usable(detail.recipe) && (
                  <>
                    <p className="subtle">
                      Original yield: {detail.recipe.servings} standard servings
                      {detail.recipe.wait
                        ? ` · plus ${detail.recipe.wait} min resting`
                        : ""}
                      .
                    </p>
                    <div className="form-grid">
                      <label>
                        People
                        <NumericInput
                          value={detailPeople}
                          min={1}
                          max={detail.meal ? 12 : 100}
                          integer
                          onCommit={(n) => {
                            setDetailPeople(n);
                            if (detail.meal)
                              changeMeal(detail.meal, {
                                people: n,
                                portionOverride: true,
                              });
                          }}
                        />
                      </label>
                      <label>
                        Appetite multiplier
                        <NumericInput
                          value={detailAppetite}
                          min={0.75}
                          max={2.5}
                          onCommit={(n) => {
                            setDetailAppetite(n);
                            if (detail.meal)
                              changeMeal(detail.meal, {
                                appetite: n,
                                portionOverride: true,
                              });
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}
                <h3>Ingredients</h3>
                {detail.recipe.ingredients.map((original) => {
                  const i =
                    detail.meal?.substitutions?.[original.name] ?? original;
                  return (
                    <div className="ingredient" key={i.name}>
                      <span>
                        {i.name}
                        {i.rawMeasure && (
                          <small style={{ display: "block" }}>
                            Source: {i.rawMeasure}
                          </small>
                        )}
                        {i.measurementNote && (
                          <small style={{ display: "block" }}>
                            {i.measurementNote}
                          </small>
                        )}
                      </span>
                      <strong>
                        {i.excludeFromShopping ? (
                          "Unquantified / optional · not in exact totals"
                        ) : (
                          <>
                            {i.approximate ? "≈ " : ""}
                            {quantity(
                              usable(detail.recipe)
                                ? scaleQuantity(
                                    i.quantity,
                                    detail.recipe.servings,
                                    detailPeople,
                                    detailAppetite,
                                  )
                                : i.quantity,
                              i.unit,
                            )}
                          </>
                        )}
                      </strong>
                    </div>
                  );
                })}
                <h3>Let’s get cooking</h3>
                <ol>
                  {(
                    cookingMethod(detail.recipe, planningSettings(state))
                      ?.instructions ?? detail.recipe.instructions
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {detail.meal?.substitutions &&
                  Object.values(detail.meal.substitutions).map((i) => (
                    <p className="notice" key={i.name}>
                      Approved substitution: {i.rawMeasure}
                    </p>
                  ))}
                {detail.recipe.source && (
                  <p className="subtle">
                    Source:{" "}
                    {detail.recipe.source.url.startsWith("https://") ? (
                      <a
                        href={detail.recipe.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {detail.recipe.source.name}
                      </a>
                    ) : (
                      detail.recipe.source.name
                    )}{" "}
                    · {detail.recipe.source.license}
                  </p>
                )}
              </>
            ) : (
              <>
                <span className="eyebrow green">MAKE IT YOURS</span>
                <h2>Choose {selectMeal?.category.toLowerCase()}</h2>
                <p>Recipes that match your household preferences.</p>
                <div className="library-grid">
                  {recipeCards(
                    selectMeal ? rankedRecipes(state, selectMeal) : [],
                  )}
                </div>
                {!state.recipes.some(
                  (r) =>
                    r.category === selectMeal?.category &&
                    matches(r, planningSettings(state)),
                ) && (
                  <p className="empty">
                    No matching recipes. Adjust your dietary, appliance or time
                    preferences in Settings.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
