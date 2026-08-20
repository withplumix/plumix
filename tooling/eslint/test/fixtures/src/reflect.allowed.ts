interface Row {
  readonly id: string;
}

const registry = new Map<string, number>();

export const count = registry.get("rows") ?? 0;

export function hasId(row: Row): boolean {
  return Reflect.has(row, "id");
}

export function keysOf(row: Row): (string | symbol)[] {
  return Reflect.ownKeys(row);
}

export function callDirectly(fn: (n: number) => number): number {
  return fn.apply(null, [1]);
}
