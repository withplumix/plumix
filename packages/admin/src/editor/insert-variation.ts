import type { ComponentData, Data } from "@puckeditor/core";

import type { InsertableBlockEntry } from "@plumix/blocks";
import { rewriteBlockNodeIds } from "@plumix/blocks";

import { blockNodesToPuckContent } from "./entry-content.js";

const CONTENT_SLOT_KEY = "content";

// Variations declare default child blocks via `innerBlocks`; on insert
// the engine slots them into the parent block's conventional `content`
// key as ComponentData[] — the shape Puck's slot fields read back from
// `puckDataToBlockTree` and the save path. ID rewrite keeps repeated
// insertions of the same variation from sharing React keys.
export function insertVariation(
  data: Data,
  entry: InsertableBlockEntry,
  index: number,
): Data {
  const props: Record<string, unknown> = { ...(entry.attrs ?? {}) };
  if (entry.innerBlocks && entry.innerBlocks.length > 0) {
    props[CONTENT_SLOT_KEY] = blockNodesToPuckContent(
      rewriteBlockNodeIds(entry.innerBlocks),
    );
  }
  const inserted: ComponentData = {
    type: entry.name,
    props: props as ComponentData["props"],
  };
  const next = [...data.content];
  next.splice(index, 0, inserted);
  return { ...data, content: next };
}
