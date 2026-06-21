import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export interface SerializePatternSourceOptions {
  readonly slug?: string;
  readonly title?: string;
}

const INDENT = "  ";

export function serializePatternSource(
  nodes: readonly BlockNode[],
  options: SerializePatternSourceOptions = {},
): string {
  const slug = options.slug ?? "starter/untitled";
  const title = options.title ?? "Untitled";
  return [
    `import { block, definePattern } from "plumix/blocks";`,
    ``,
    `export const pattern = definePattern({`,
    `${INDENT}name: ${JSON.stringify(slug)},`,
    `${INDENT}title: ${JSON.stringify(title)},`,
    `${INDENT}content: ${renderValue(nodes, 1)},`,
    `});`,
    ``,
  ].join("\n");
}

function renderNode(node: BlockNode, depth: number): string {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  // Drop the `id` key — the editor's flattening puts the node ID into
  // attrs, but no block declares `id` as an input so `commitPatterns`
  // rejects pasted snippets that carry it. `block()` writes the ID itself.
  const attrEntries = Object.entries(node.attrs ?? {}).filter(
    ([key]) => key !== "id",
  );
  const tail = node.style ? `, { style: ${JSON.stringify(node.style)} }` : "";
  if (attrEntries.length === 0) {
    return `${pad}block(${JSON.stringify(node.name)}, {}${tail})`;
  }
  const lines = attrEntries.map(
    ([key, value]) => `${inner}${key}: ${renderValue(value, depth + 1)},`,
  );
  return `${pad}block(${JSON.stringify(node.name)}, {\n${lines.join("\n")}\n${pad}}${tail})`;
}

function renderValue(value: unknown, depth: number): string {
  if (isBlockNodeArray(value)) {
    if (value.length === 0) return "[]";
    const pad = INDENT.repeat(depth);
    const children = value.map((n) => renderNode(n, depth + 1)).join(",\n");
    return `[\n${children},\n${pad}]`;
  }
  return JSON.stringify(value);
}
