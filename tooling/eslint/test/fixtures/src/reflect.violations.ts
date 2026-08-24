interface Row {
  readonly id: string;
}

export function readId(row: Row): string {
  return Reflect.get(row, "id");
}

export function callWith(fn: (n: number) => number): number {
  return Reflect.apply(fn, undefined, [1]);
}

// No carve-out for values whose shape isn't pinned down: an open bag is a
// parse boundary, and `Reflect.get` isn't how you cross one.
export function readLoose(bag: Record<string, unknown>): string {
  return String(Reflect.get(bag, "id"));
}
