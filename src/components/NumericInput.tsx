import { useEffect, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { parseNumberDraft } from "../numeric";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur" | "type" | "min" | "max"
> & {
  value: number | null | undefined;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
};
export function NumericInput({
  value,
  onCommit,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
  ...props
}: Props) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(value?.toString() ?? "");
  }, [value]);
  function commit() {
    const n = parseNumberDraft(draft, min, max, integer);
    if (n === undefined) {
      setDraft(value?.toString() ?? "");
      setError(
        `Enter ${integer ? "a whole number" : "a number"} from ${min} to ${max === Number.MAX_SAFE_INTEGER ? "a valid maximum" : max}. Previous value kept.`,
      );
      return;
    }
    setError("");
    if (n !== value) onCommit(n);
  }
  return (
    <span className="numeric-field">
      <input
        {...props}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        min={min}
        max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        step={props.step ?? (integer ? "1" : "any")}
        value={draft}
        aria-invalid={!!error}
        onChange={(e) => {
          setDraft(e.target.value);
          setError("");
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {error && <small role="status">{error}</small>}
    </span>
  );
}
