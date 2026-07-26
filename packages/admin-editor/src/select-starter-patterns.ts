import { byPriorityThen } from "@plumix/core/manifest";

import type { InserterPattern } from "./block-catalog.js";

/**
 * The patterns offered as starting points for a blank entry: those marked
 * `target: "post-content"` whose `entryTypes` include the entry being authored
 * (or that name no type at all), ordered lowest-`priority`-first with ties
 * broken by name. A pattern that restricts itself to specific entry types is
 * dropped when the entry type is unknown.
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
