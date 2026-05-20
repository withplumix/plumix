import type { BlockNode } from "@plumix/blocks";
import type { Data } from "@puckeditor/core";
import { isBlockNodeArray } from "@plumix/blocks";

export interface V2EntryContent {
  readonly version: "plumix.v2";
  readonly blocks: readonly BlockNode[];
}

export function isV2EntryContent(value: unknown): value is V2EntryContent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; blocks?: unknown };
  return candidate.version === "plumix.v2" && isBlockNodeArray(candidate.blocks);
}

export function blockNodesToPuckContent(
  nodes: readonly BlockNode[],
): Data["content"] {
  return nodes.map((node) => ({
    type: node.name,
    props: {
      id: node.id,
      ...node.attrs,
      ...(node.style ? { style: node.style } : {}),
    },
  }));
}

export function seedPuckData(content: unknown, fallback: Data): Data {
  if (!isV2EntryContent(content)) return fallback;
  return { content: blockNodesToPuckContent(content.blocks), root: {} };
}
