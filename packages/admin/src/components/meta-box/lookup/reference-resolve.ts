import type { JsonObject } from "@plumix/core";

import type { LookupItem } from "./types.js";

/**
 * `pending` keeps a picker from flashing "missing" before the first resolve
 * settles.
 */
export type ResolvedReference =
  | { readonly status: "found"; readonly item: LookupItem }
  | { readonly status: "pending" }
  | { readonly status: "orphan" };

/**
 * One batched call. Every selected id already hydrated makes the round-trip
 * unnecessary, so the query stays disabled.
 */
export function planReferenceResolve({
  kind,
  scope,
  ids,
  initialSelected,
}: {
  readonly kind: string;
  readonly scope?: JsonObject;
  readonly ids: readonly string[];
  readonly initialSelected: readonly LookupItem[];
}): {
  readonly input: {
    readonly kind: string;
    readonly scope?: JsonObject;
    readonly ids: string[];
  };
  readonly enabled: boolean;
} {
  const prefilled = new Set(initialSelected.map((row) => row.id));
  const allPrefilled = ids.length > 0 && ids.every((id) => prefilled.has(id));
  return {
    // Spread to drop `readonly` — the wire schema wants a mutable array.
    input: { kind, scope, ids: [...ids] },
    enabled: ids.length > 0 && !allPrefilled,
  };
}

/**
 * A live resolve (when one ran) overrides the hydrated prefill. `pending`
 * means the resolve is in flight, so a row renders a skeleton rather than a
 * premature "missing".
 */
export function referenceStatus(
  id: string,
  {
    prefill,
    items,
    pending,
  }: {
    readonly prefill: readonly LookupItem[];
    readonly items: readonly LookupItem[];
    readonly pending: boolean;
  },
): ResolvedReference {
  const item =
    items.find((row) => row.id === id) ?? prefill.find((row) => row.id === id);
  if (item) return { status: "found", item };
  if (pending) return { status: "pending" };
  return { status: "orphan" };
}
