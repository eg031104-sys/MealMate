// Reproducible curation from the pinned, public-domain source checkout.
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const root = resolve(process.argv[2] ?? "");
const pinned = "134e22f11e4d14e66ee587b1dd3a266e5646d387";
if (
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim() !== pinned
)
  throw Error("Check out the documented source commit before importing.");
const temp = join(tmpdir(), "mealmate-curation-" + process.pid);
mkdirSync(temp, { recursive: true });
try {
  execFileSync("python", [
    "scripts/recipes/extract_sources.py",
    root,
    join(temp, "sources.json"),
  ]);
  await build({
    entryPoints: ["src/recipe-curation.ts"],
    outfile: join(temp, "adapter.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { curateSource } = await import(
    pathToFileURL(join(temp, "adapter.mjs"))
  );
  const all = JSON.parse(readFileSync(join(temp, "sources.json")));
  const selected = JSON.parse(readFileSync("scripts/recipes/selection.json"));
  const original = JSON.parse(
    readFileSync("src/data/curated-recipes.json"),
  ).filter((r) =>
    ["themealdb-53110", "pdr-banana-oatmeal-cookies"].includes(r.id),
  );
  if (original.length !== 2)
    throw Error("Initial verified source records are missing.");
  const recipes = [...original],
    snapshots = [];
  for (const [category, slugs] of Object.entries(selected))
    for (const slug of slugs) {
      const c = all.find((c) => c.slug === slug);
      if (!c) throw Error("Missing source: " + slug);
      const recipe = curateSource(c, category);
      if (recipe.review.length)
        throw Error(slug + ": " + recipe.review.join("; "));
      if (
        recipes.some(
          (r) =>
            r.id === recipe.id ||
            r.name.toLowerCase() === recipe.name.toLowerCase(),
        )
      )
        throw Error("Duplicate: " + slug);
      recipes.push(recipe);
      snapshots.push(c);
      copyFileSync(
        join(root, "content", slug + ".md"),
        join("public/recipe-sources", slug + ".md"),
      );
      if (c.photo)
        copyFileSync(
          join(root, "static", c.photo),
          join("public/recipe-photos", slug + ".webp"),
        );
    }
  writeFileSync(
    "src/data/curated-recipes.json",
    JSON.stringify(recipes, null, 2) + "\n",
  );
  writeFileSync(
    "scripts/recipes/selected-sources.json",
    JSON.stringify(snapshots, null, 2) + "\n",
  );
  const audit = all.map((c) => ({
    slug: c.slug,
    issues: curateSource(c, "Dinner").review,
    selected: snapshots.some((s) => s.slug === c.slug),
  }));
  writeFileSync(
    "scripts/recipes/source-audit.json",
    JSON.stringify(audit, null, 2) + "\n",
  );
  console.log(
    "Imported",
    recipes.length,
    "recipes",
    Object.fromEntries(
      ["Dinner", "Lunch", "Breakfast", "Snacks"].map((c) => [
        c,
        recipes.filter((r) => r.category === c).length,
      ]),
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
