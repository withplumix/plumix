import { useState } from "react";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

import type { LookupItem } from "./types.js";

// A search box backed by the `lookup.list` RPC. Owns the query string and
// the fetch; the caller owns dialog open/close (passed as `enabled`) and any
// post-filtering of the results. Shared by the reference pickers and the link
// field's entry picker — same RPC, same result shape, different surrounding
// UX. `query` is trimmed for the RPC (a blank search lists everything) while
// the raw value stays bound to the input so the user's spaces survive.
export function useLookupSearch({
  kind,
  scope,
  enabled,
}: {
  readonly kind: string;
  readonly scope?: Record<string, unknown>;
  readonly enabled: boolean;
}): {
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly items: readonly LookupItem[];
  readonly isLoading: boolean;
} {
  const [query, setQuery] = useState("");
  const listQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: { kind, query: query.trim() || undefined, scope, limit: 20 },
    }),
    enabled,
  });
  return {
    query,
    setQuery,
    items: listQuery.data?.items ?? [],
    isLoading: listQuery.isLoading,
  };
}
