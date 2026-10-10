import type { ResolvedBlockLoaders } from "@plumix/core/blocks";
import type { SerializedLoaderData } from "@plumix/core/blocks/renderer";

/**
 * A refreshed entry clears its earlier error. Returns a new map so React sees a
 * change.
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
