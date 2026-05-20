import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export interface EntryContent {
  readonly version: "plumix.v2";
  readonly blocks: readonly BlockNode[];
}

export function isEntryContent(value: unknown): value is EntryContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; blocks?: unknown };
  return (
    candidate.version === "plumix.v2" && isBlockNodeArray(candidate.blocks)
  );
}
