import type { PatternManifestEntry } from "@plumix/core/manifest";
import { byPriorityThen } from "@plumix/core/manifest";

export function selectStarterPatterns(
  patterns: readonly PatternManifestEntry[],
  entryType: string,
): readonly PatternManifestEntry[] {
  return patterns
    .filter(
      (p) =>
        p.target === "post-content" &&
        (p.entryTypes === undefined || p.entryTypes.includes(entryType)),
    )
    .sort(byPriorityThen((p) => p.name));
}
