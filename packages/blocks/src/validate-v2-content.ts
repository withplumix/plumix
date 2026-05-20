import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";
import type { BlockContentValidationResult } from "./validate-content.js";
import type { V2EntryContent } from "./v2-entry-content.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";

// Issues emit a v2-specific path grammar: `blocks[i]` at the root and
// `blocks[i].<slotKey>[j]` for nested slot children. Admin clients can
// dispatch validator origin off the path prefix (v1 always starts with
// `content[`, v2 always starts with `blocks[`).
export function validateV2EntryContent(
  content: V2EntryContent,
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
