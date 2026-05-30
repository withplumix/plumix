import type { Data } from "@puckeditor/core";

import type { BlockNode } from "@plumix/blocks";
import type { PatternManifestEntry } from "@plumix/core/manifest";
import { rewriteBlockNodeIds } from "@plumix/blocks";

import { blockNodesToPuckContent } from "./entry-content.js";

const PATTERN_REF_BLOCK = "core/pattern-ref";

export function insertPattern(
  data: Data,
  pattern: PatternManifestEntry,
  destinationIndex: number,
): Data {
  // Default to copy when the manifest entry doesn't carry an explicit
  // insert mode (older payloads, hand-written test fixtures).
  return pattern.insert === "reference"
    ? insertPatternReference(data, pattern.name, destinationIndex)
    : insertPatternCopy(data, pattern.content, destinationIndex);
}

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

export function insertPatternReference(
  data: Data,
  slug: string,
  destinationIndex: number,
): Data {
  const refNode: BlockNode = {
    id: "",
    name: PATTERN_REF_BLOCK,
    attrs: { slug },
  };
  const [puckRef] = blockNodesToPuckContent(rewriteBlockNodeIds([refNode]));
  const next = [...data.content];
  if (puckRef) next.splice(destinationIndex, 0, puckRef);
  return { ...data, content: next };
}
