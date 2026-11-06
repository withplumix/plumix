import type { AnyEventDefinition, AnyFilterDefinition } from "./define.js";

/**
 * The same declarations, keeping their ids, scoped to one registered name: a
 * scoped handler runs only when that name fires, and before unscoped ones of
 * its order.
 */
export function scopeDeclarations<
  T extends Readonly<Record<string, AnyEventDefinition | AnyFilterDefinition>>,
>(declarations: T, scope: string): T {
  const scoped: Record<string, AnyEventDefinition | AnyFilterDefinition> = {};
  for (const [key, declaration] of Object.entries(declarations)) {
    scoped[key] = { ...declaration, scope };
  }
  // Safety: each value is its own declaration with `scope` set, which every
  // declaration type carries as optional.
  return scoped as T;
}
