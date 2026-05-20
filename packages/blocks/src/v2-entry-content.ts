import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export interface V2EntryContent {
  readonly version: "plumix.v2";
  readonly blocks: readonly BlockNode[];
}

export function isV2EntryContent(value: unknown): value is V2EntryContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; blocks?: unknown };
  return candidate.version === "plumix.v2" && isBlockNodeArray(candidate.blocks);
}
