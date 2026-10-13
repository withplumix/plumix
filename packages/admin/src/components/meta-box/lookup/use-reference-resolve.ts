import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

import type { JsonObject } from "@plumix/core";

import type { ResolvedReference } from "./reference-resolve.js";
import type { LookupItem } from "./types.js";
import { planReferenceResolve, referenceStatus } from "./reference-resolve.js";

/** One batched call, skipping ids `initialSelected` already covers. */
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
  const { input, enabled } = planReferenceResolve({
    kind,
    scope,
    ids,
    initialSelected,
  });
  const resolveQuery = useQuery({
    ...orpc.lookup.list.queryOptions({ input }),
    enabled,
  });

  const pending =
    ids.length > 0 && resolveQuery.data === undefined && !resolveQuery.isError;

  const statusOf = (id: string): ResolvedReference =>
    referenceStatus(id, {
      prefill: initialSelected,
      items: resolveQuery.data?.items ?? [],
      pending,
    });

  return { statusOf, isError: resolveQuery.isError };
}
