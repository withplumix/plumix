import type { EntryContent } from "@plumix/core/blocks";
import { byPriorityThen } from "@plumix/core/manifest";

import type { InserterPattern } from "./block-catalog.js";

/**
 * A pattern scoped to specific entry types is dropped when the entry type is
 * unknown.
 */
export function selectStarterPatterns(
  patterns: readonly InserterPattern[],
  entryType: string | undefined,
): readonly InserterPattern[] {
  return patterns
    .filter(
      (p) =>
        p.target === "post-content" &&
        (p.entryTypes === undefined ||
          (entryType !== undefined && p.entryTypes.includes(entryType))),
    )
    .sort(byPriorityThen((p) => p.name));
}

/** Starters are offered to a blank entry only: never prepend a layout to real
 *  work. */
export function shouldOpenStarter(
  content: EntryContent | undefined,
  candidates: readonly InserterPattern[],
): boolean {
  return (content?.blocks.length ?? 0) === 0 && candidates.length > 0;
}
