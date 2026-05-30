import type { BlockPattern, PatternRegistry } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";
import { createPatternRegistry } from "@plumix/blocks";

// PatternManifestEntry and BlockPattern are structurally identical apart
// from `category`'s type-level narrowing — the manifest projects the
// already-frozen body verbatim, so re-running `definePattern` would
// re-walk the tree pointlessly. We construct the registry directly.
export function buildAdminPatternRegistry(
  entries: readonly PatternManifestEntry[],
): PatternRegistry {
  const patterns = entries as unknown as readonly BlockPattern[];
  return createPatternRegistry(patterns);
}
