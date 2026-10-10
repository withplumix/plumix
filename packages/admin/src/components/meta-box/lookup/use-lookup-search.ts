import { useState } from "react";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

import type { JsonObject } from "@plumix/core";

import type { LookupItem } from "./types.js";

// Trims only the RPC query, so the user's spaces survive in the input.
export function useLookupSearch({
  kind,
  scope,
  enabled,
}: {
  readonly kind: string;
  readonly scope?: JsonObject;
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
