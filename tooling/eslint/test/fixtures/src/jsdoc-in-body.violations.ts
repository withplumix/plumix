export function area(size: number): number {
  /** Clamped edge. */
  const edge = Math.min(size, 3);
  return edge * edge;
}

export class Counter {
  #count = 0;

  increment(): number {
    /** Next value. */
    const next = this.#count + 1;
    this.#count = next;
    return next;
  }
}
