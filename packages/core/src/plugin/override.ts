type Composable<T> = T | ((prev: T) => T);

/**
 * The registered name can't be overridden: it is the `registerEntryType`
 * argument, which keeps `entries.type` rows and `forEntryType("post")` valid.
 */
export type Overridable<O> = {
  readonly [K in keyof O]?: O[K] extends readonly unknown[] | undefined
    ? Composable<NonNullable<O[K]>>
    : O[K];
};

/**
 * Object-valued fields merge one level deep, so overriding one label keeps the
 * rest; arrays and scalars replace, or compose via `(prev) => next`.
 */
export function applyOverride<O extends object>(
  defaults: O,
  override: Overridable<O> | undefined,
): O {
  if (override === undefined) return defaults;
  // Safety: `O` is a registration-options interface, so it has no index
  // signature to spread through structurally. Every key walked below comes from
  // `override`, which is keyed by `keyof O`.
  const out = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const base = out[key];
    if (typeof value === "function") {
      // Safety: `Composable` only wraps array-valued fields, so the function
      // form is always `(prev: T[]) => T[]`. An absent default seeds `[]` so a
      // compose callback never has to guard for it.
      const compose = value as (prev: readonly unknown[]) => readonly unknown[];
      out[key] = compose(Array.isArray(base) ? base : []);
    } else if (isPlainObject(base) && isPlainObject(value)) {
      out[key] = { ...base, ...value };
    } else {
      out[key] = value;
    }
  }
  return out as O;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
