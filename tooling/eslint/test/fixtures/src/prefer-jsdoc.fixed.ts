/** Doubles the input. */
function double(value: number): number {
  return value * 2;
}

interface Shape {
  /** Edge length in pixels. */
  readonly size: number;
}

export class Counter {
  /** Starts at zero. */
  #count = 0;

  current(): number {
    return this.#count;
  }
}

/**
 * The ceiling, kept low so a preview renders fast
 * on a cold worker.
 */
export const LIMIT = 3;

/** Empty until a plugin augments it. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Registry {}

export function area(shape: Shape): number {
  return double(Math.min(shape.size, LIMIT));
}
