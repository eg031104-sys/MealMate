export function parseNumberDraft(
  value: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
): number | undefined {
  if (!value.trim()) return;
  const n = Number(value);
  return Number.isFinite(n) &&
    n >= min &&
    n <= max &&
    (!integer || Number.isInteger(n))
    ? n
    : undefined;
}
