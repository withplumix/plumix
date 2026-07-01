interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function normalizeFocalPoint(raw: unknown): FocalPoint | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return undefined;
  }
  return { x: clamp01(x), y: clamp01(y) };
}
