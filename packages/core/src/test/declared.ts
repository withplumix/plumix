/** What an assertion matches against: any subset of the keys, at any depth. */
export type PartialMatch<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: PartialMatch<T[K]> }
    : T;

/** An event or a filter, as its declaration names it. */
export interface Declared {
  readonly id: string;
  readonly scope?: string;
}

/** An unscoped declaration covers every scope, as its handlers do. */
export function covers(asked: Declared, fired: Declared): boolean {
  return (
    asked.id === fired.id &&
    (asked.scope === undefined || asked.scope === fired.scope)
  );
}

export function nameOf(declared: Declared): string {
  return declared.scope === undefined
    ? `"${declared.id}"`
    : `"${declared.id}" for "${declared.scope}"`;
}

export function timesOf(count: number): string {
  return count === 1 ? "once" : `${String(count)} times`;
}

export function describeValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
