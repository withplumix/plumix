import type { Data } from "@puckeditor/core";

import type { BlockNode } from "@plumix/blocks";
import { rewriteBlockNodeIds } from "@plumix/blocks";

import { blockNodesToPuckContent } from "./entry-content.js";

export function insertPatternCopy(
  data: Data,
  content: readonly BlockNode[],
  destinationIndex: number,
): Data {
  const puckContent = blockNodesToPuckContent(rewriteBlockNodeIds(content));
  const next = [...data.content];
  next.splice(destinationIndex, 0, ...puckContent);
  return { ...data, content: next };
}
