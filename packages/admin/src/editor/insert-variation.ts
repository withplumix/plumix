import type { PuckAction } from "@puckeditor/core";

import type { InsertableBlockEntry } from "@plumix/blocks";
import { rewriteBlockNodeIds } from "@plumix/blocks";

import { blockNodesToPuckContent } from "./entry-content.js";
import { mergePropsAtSelector } from "./merge-variation-attrs.js";
import { PUCK_ROOT_ZONE } from "./puck-zones.js";

const CONTENT_SLOT_KEY = "content";

// Compute the props patch to merge onto a freshly-inserted block when
// the chosen entry is a variation. Returns an empty object when there's
// nothing to merge — callers skip the follow-up `setData` dispatch in
// that case. Slot content is converted to `ComponentData[]` (the shape
// Puck's slot fields expect) and ID-rewritten so repeated insertions of
// the same variation never collide on React keys.
//
// The caller dispatches Puck's native `insert` action first — Puck
// generates `props.id` itself there. Then this merge runs on top via
// `setData` + `mergePropsAtSelector`. Doing it in two dispatches
// (rather than constructing the ComponentData by hand) keeps Puck's
// internal id-generation contract intact, so the autosave hook sees a
// single state change per insert and the dedup path doesn't race.
export function computeVariationMergeAttrs(
  entry: InsertableBlockEntry,
): Readonly<Record<string, unknown>> {
  const base = entry.attrs ?? {};
  if (!entry.innerBlocks || entry.innerBlocks.length === 0) {
    return base;
  }
  return {
    ...base,
    [CONTENT_SLOT_KEY]: blockNodesToPuckContent(
      rewriteBlockNodeIds(entry.innerBlocks),
    ),
  };
}

// Two-dispatch insert at the root zone: Puck's `insert` stamps
// `props.id`, then the variation merge overlays attrs + slot content via
// `mergePropsAtSelector`. The follow-up `setData` is skipped when the
// entry has nothing to merge, so plain block inserts stay single-action.
export function dispatchVariationInsert(
  dispatch: (action: PuckAction) => void,
  entry: InsertableBlockEntry,
  index: number,
): void {
  dispatch({
    type: "insert",
    componentType: entry.name,
    destinationZone: PUCK_ROOT_ZONE,
    destinationIndex: index,
  });
  const mergeAttrs = computeVariationMergeAttrs(entry);
  if (Object.keys(mergeAttrs).length === 0) return;
  dispatch({
    type: "setData",
    data: (previous) =>
      mergePropsAtSelector(
        previous,
        { zone: PUCK_ROOT_ZONE, index },
        mergeAttrs,
      ),
  });
}
