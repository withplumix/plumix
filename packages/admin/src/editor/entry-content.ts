import type { ComponentData, Data } from "@puckeditor/core";

import type { BlockNode } from "@plumix/blocks";
import { isBlockNodeArray, isEntryContent } from "@plumix/blocks";

export { isEntryContent } from "@plumix/blocks";

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
  if (!isEntryContent(content)) return fallback;
  return { content: blockNodesToPuckContent(content.blocks), root: {} };
}
