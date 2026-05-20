import type { BlockNode } from "@plumix/blocks";
import type { ComponentData, Data } from "@puckeditor/core";
import { isBlockNodeArray, isV2EntryContent } from "@plumix/blocks";

export type { V2EntryContent } from "@plumix/blocks";
export { isV2EntryContent } from "@plumix/blocks";

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
