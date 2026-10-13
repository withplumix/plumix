import type { JsonObject } from "@plumix/core";

/** Trims only the RPC query, so the user's spaces survive in the input. */
export function lookupSearchInput({
  kind,
  scope,
  query,
}: {
  readonly kind: string;
  readonly scope?: JsonObject;
  readonly query: string;
}): {
  readonly kind: string;
  readonly query?: string;
  readonly scope?: JsonObject;
  readonly limit: number;
} {
  return { kind, query: query.trim() || undefined, scope, limit: 20 };
}
