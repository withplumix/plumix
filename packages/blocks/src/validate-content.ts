import type { BlockNode } from "./render-block-tree.js";
import type { EntryContent } from "./entry-content.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export type BlockContentValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly errors: readonly BlockContentValidationIssue[];
    };

// Issues use the path grammar `blocks[i]` at the root and
// `blocks[i].<slotKey>[j]` for nested slot children.
export function validateEntryContent(
  content: EntryContent,
  registry: { has(name: string): boolean },
): BlockContentValidationResult {
  const errors: BlockContentValidationIssue[] = [];
  walk(content.blocks, "blocks", errors, registry);
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}

function walk(
  nodes: readonly BlockNode[],
  basePath: string,
  out: BlockContentValidationIssue[],
  registry: { has(name: string): boolean },
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    if (!registry.has(node.name)) {
      out.push({
        code: "unknown_block_type",
        message: `Unknown block type "${node.name}" at ${path}.`,
        path,
        nodeName: node.name,
      });
      return;
    }
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      if (isBlockNodeArray(value)) {
        walk(value, `${path}.${key}`, out, registry);
      }
    }
  });
}
