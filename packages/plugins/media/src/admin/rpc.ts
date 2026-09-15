import type { AppRouter } from "plumix";
import type { PluginRpcOutputs } from "plumix/admin";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

import type { MediaRouter } from "../rpc.js";

// The subdirectory mount the host exposes (see plumix-globals), used to prefix
// the worker-routed `/_plumix/...` URLs the admin components build.
export function pluginBasePath(): string {
  return (
    (globalThis as { plumix?: { basePath?: string } }).plumix?.basePath ?? ""
  );
}

// Media's own `media/*` procedures.
export const mediaRpc = createPluginRpcClient<MediaRouter>("media");

// `lookup/list` is a core namespace (see `CORE_RPC_NAMESPACES`), not
// media's own — reference-field label resolution calls through it directly.
type LookupRouter = AppRouter["lookup"];
export const lookupRpc = createPluginRpcClient<LookupRouter>("lookup");

export type MediaLookupItem =
  PluginRpcOutputs<LookupRouter>["list"]["items"][number];

/**
 * Resolve display labels for picked media ids in one batched
 * `lookup/list({ ids })` call — meta storage is plain ids, so the
 * pickers look labels up at render time. Ids absent from the result
 * are unresolved (deleted, unpublished, or still loading); callers
 * fall back to an id placeholder.
 */
export function useMediaLabels(
  ids: readonly string[],
): ReadonlyMap<string, MediaLookupItem> {
  const query = useQuery({
    enabled: ids.length > 0,
    queryKey: ["plugin-media", "lookup", [...ids].sort().join(" ")],
    // The wire schema types its arrays mutable; the param keeps them readonly.
    queryFn: () => lookupRpc.list({ kind: "media", ids: [...ids] }),
  });
  const items = query.data?.items;
  return useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  );
}
