import { useMemo } from "react";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

import type { JsonObject } from "@plumix/core";

import type { LookupItem } from "./types.js";

// Per-id outcome of resolving a selected reference. `pending` covers the
// window between mount and the first settled resolve, so a picker never
// flashes "missing"; `orphan` means the resolve settled with no matching
// row (the target was deleted or fell out of scope).
export type ResolvedReference =
  | { readonly status: "found"; readonly item: LookupItem }
  | { readonly status: "pending" }
  | { readonly status: "orphan" };

// Resolves already-selected reference ids to their display rows through a
// single batched `lookup.list` call, skipping ids the read-time hydration
// already covered (`initialSelected`, #1507). The single and multi reference
// pickers share this — the single picker passes a one-element `ids` — so the
// resolve strategy and the found/pending/orphan tri-state live in one place.
export function useReferenceResolve({
  kind,
  scope,
  ids,
  initialSelected = [],
}: {
  readonly kind: string;
  readonly scope?: JsonObject;
  readonly ids: readonly string[];
  readonly initialSelected?: readonly LookupItem[];
}): {
  readonly statusOf: (id: string) => ResolvedReference;
  readonly isError: boolean;
} {
  const prefillById = useMemo(() => {
    const map = new Map<string, LookupItem>();
    for (const row of initialSelected) map.set(row.id, row);
    return map;
  }, [initialSelected]);

  // Every selected id already hydrated → the resolve round-trip is
  // unnecessary, so the query stays disabled.
  const allPrefilled = ids.length > 0 && ids.every((id) => prefillById.has(id));

  const resolveQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      // Spread to drop `readonly` — the wire schema wants a mutable array.
      input: { kind, scope, ids: [...ids] },
    }),
    enabled: ids.length > 0 && !allPrefilled,
  });

  const resolvedById = useMemo(() => {
    const map = new Map<string, LookupItem>();
    // Hydrated prefill first; a live resolve (when one ran) overrides.
    for (const row of prefillById.values()) map.set(row.id, row);
    for (const row of resolveQuery.data?.items ?? []) map.set(row.id, row);
    return map;
  }, [prefillById, resolveQuery.data]);

  // Distinguish "resolve in flight" from "settled, no row" so rows render a
  // skeleton rather than a premature "missing" while the first fetch lands.
  const isPending =
    ids.length > 0 && resolveQuery.data === undefined && !resolveQuery.isError;

  const statusOf = (id: string): ResolvedReference => {
    const item = resolvedById.get(id);
    if (item) return { status: "found", item };
    if (isPending) return { status: "pending" };
    return { status: "orphan" };
  };

  return { statusOf, isError: resolveQuery.isError };
}
