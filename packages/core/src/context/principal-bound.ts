import type { AppContext } from "./app-context.js";

/**
 * Keyed on the bound value, so a context derived by spreading carries the way
 * to rebind it without the field's type naming it.
 */
const rebinders = new WeakMap<object, (ctx: AppContext) => object>();

/** Marks `value` as acting for its context's principal; `rebind` makes another. */
export function actsAsPrincipal<T extends object>(
  value: T,
  rebind: (ctx: AppContext) => T,
): T {
  rebinders.set(value, rebind);
  return value;
}

/** `value` bound to `ctx`'s principal, or `value` itself when nothing binds it. */
export function rebindToPrincipal<T extends object>(
  value: T,
  ctx: AppContext,
): T {
  const rebind = rebinders.get(value);
  // Safety: `actsAsPrincipal` only stores a rebinder returning its value's type.
  return rebind === undefined ? value : (rebind(ctx) as T);
}
