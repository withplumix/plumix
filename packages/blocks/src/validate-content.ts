import type { BlockSpec } from "./block-registry.js";
import type { EntryContent } from "./entry-content.js";
import type { BlockNode } from "./render-block-tree.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export type BlockContentValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly errors: readonly BlockContentValidationIssue[];
    };

interface SpecLookup {
  get(name: string): BlockSpec | undefined;
}

// Issues use the path grammar `blocks[i]` at the root and
// `blocks[i].<slotKey>[j]` for nested slot children.
export function validateEntryContent(
  content: EntryContent,
  registry: SpecLookup,
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
  registry: SpecLookup,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    const spec = registry.get(node.name);
    if (!spec) {
      out.push({
        code: "unknown_block_type",
        message: `Unknown block type "${node.name}" at ${path}.`,
        path,
        nodeName: node.name,
      });
      return;
    }
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      if (!isBlockNodeArray(value)) continue;
      // Absent `allowedBlocks` = any child (general content slots), by design.
      const allowed = spec.inputs?.find(
        (input) => input.name === key,
      )?.allowedBlocks;
      if (allowed) {
        value.forEach((child, j) => {
          if (allowed.includes(child.name)) return;
          const childPath = `${path}.${key}[${String(j)}]`;
          out.push({
            code: "disallowed_child",
            message: `Block "${child.name}" is not allowed in slot "${key}" of "${node.name}" at ${childPath}.`,
            path: childPath,
            nodeName: child.name,
            slotName: key,
          });
        });
      }
      walk(value, `${path}.${key}`, out, registry);
    }
  });
}
