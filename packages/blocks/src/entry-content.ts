import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export interface EntryContent {
  readonly version: "plumix.v2";
  readonly blocks: readonly BlockNode[];
}

/**
 * Stamp a `BlockNode[]` with the current envelope so externally-built
 * content (seeds, migrations, fixtures) survives the runtime
 * `isEntryContent` guard instead of silently rendering blank (#607).
 */
export function defineEntryContent(blocks: readonly BlockNode[]): EntryContent {
  return { version: "plumix.v2", blocks };
}

export function isEntryContent(value: unknown): value is EntryContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; blocks?: unknown };
  return (
    candidate.version === "plumix.v2" && isBlockNodeArray(candidate.blocks)
  );
}
