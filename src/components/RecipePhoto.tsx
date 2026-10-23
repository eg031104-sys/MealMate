import { useEffect, useState } from "react";
import { Utensils } from "lucide-react";
import type { Recipe } from "../domain";
export function validPhotoURL(url: string | undefined) {
  return (
    !!url && (/^https:\/\//.test(url) || url.startsWith("/recipe-photos/"))
  );
}
export function RecipePhoto({
  recipe,
  large = false,
}: {
  recipe: Recipe;
  large?: boolean;
}) {
  const url = recipe.photo?.url ?? recipe.image;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div className={"recipe-photo " + (large ? "photo-large" : "")}>
      {validPhotoURL(url) && !failed ? (
        <img
          src={url}
          alt={recipe.name}
          loading={large ? "eager" : "lazy"}
          decoding="async"
          width="640"
          height="420"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="photo-placeholder">
          <Utensils size={large ? 44 : 28} />
          <span>Photograph not available</span>
        </div>
      )}
    </div>
  );
}
export function PhotoCredit({ recipe }: { recipe: Recipe }) {
  return recipe.photo ? (
    <p className="photo-credit">
      Photo: {recipe.photo.author} · {recipe.photo.license} ·{" "}
      <a
        href={
          recipe.photo.sourceUrl.startsWith("https://")
            ? recipe.photo.sourceUrl
            : undefined
        }
        target="_blank"
        rel="noreferrer"
      >
        Source
      </a>
    </p>
  ) : recipe.image ? (
    <p className="photo-credit">
      Image provided by {recipe.source?.name ?? "recipe contributor"}. See
      source terms; not cached automatically.
    </p>
  ) : null;
}
