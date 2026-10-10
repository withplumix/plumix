/** Doubles the input. */
function double(value: number): number {
  return value * 2;
}

/** The ceiling. */
const LIMIT = 3;

interface Shape {
  /** Edge length. */
  readonly size: number;
}

export function area(shape: Shape): number {
  /** Clamped edge. */
  const edge = Math.min(shape.size, LIMIT);
  return double(edge);
}
