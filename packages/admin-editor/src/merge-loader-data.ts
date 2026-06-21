import type { ResolvedBlockLoaders } from "@plumix/blocks";
import type { SerializedLoaderData } from "@plumix/blocks/renderer";

/**
 * Overlay a scoped refresh's node-keyed loader map onto the canvas's existing
 * loader data. Each refreshed entry replaces the prior one with fresh data and
 * a cleared error (a successful re-resolve supersedes any earlier failure).
 * Returns a new map; the prior one is left untouched so React sees a change.
 */
export function mergeLoaderData(
  prior: ResolvedBlockLoaders,
  data: SerializedLoaderData,
): ResolvedBlockLoaders {
  const next = new Map(prior);
  for (const [nodeId, loaders] of Object.entries(data)) {
    next.set(nodeId, { loaders, error: null });
  }
  return next;
}
