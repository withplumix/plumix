export function clampColumns(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  if (truncated < 1) return 1;
  if (truncated > 8) return 8;
  return truncated;
}

// `auto` keeps the image's native ratio; `N:M` ratios are passed
// through unchanged for `aspect-ratio: N / M`. Anything else returns
// undefined so the wrapper omits the data attribute entirely (matches
// v1 — the inspector's "missing" state shouldn't lock to "1:1").
export function pickAspect(raw: unknown): string | undefined {
  if (raw === "auto") return "auto";
  return typeof raw === "string" && /^[1-9]\d*:[1-9]\d*$/.test(raw)
    ? raw
    : undefined;
}

export function normalizeGap(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return `${raw}px`;
  return undefined;
}
