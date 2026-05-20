import type { BlockNode } from "@plumix/blocks";
import type { ComponentData, Data } from "@puckeditor/core";
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
  return nodes.map(nodeToComponentData);
}

function nodeToComponentData(node: BlockNode): ComponentData {
  const props: Record<string, unknown> = { id: node.id };
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    props[key] = isBlockNodeArray(value)
      ? value.map(nodeToComponentData)
      : value;
  }
  if (node.style) props.style = node.style;
  return { type: node.name, props: props as ComponentData["props"] };
}

export function seedPuckData(content: unknown, fallback: Data): Data {
  if (!isV2EntryContent(content)) return fallback;
  return { content: blockNodesToPuckContent(content.blocks), root: {} };
}
