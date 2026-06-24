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
  walk(content.blocks, "blocks", null, errors, registry);
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}

function walk(
  nodes: readonly BlockNode[],
  basePath: string,
  parentName: string | null,
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
    // The inverse of a slot's `allowedBlocks`: a parent-bound block may only sit
    // under a listed parent (and never at the top level, where parentName null).
    if (
      spec.requiresParent &&
      (parentName === null || !spec.requiresParent.includes(parentName))
    ) {
      out.push({
        code: "requires_parent",
        message: `Block "${node.name}" can only be nested under ${spec.requiresParent
          .map((p) => `"${p}"`)
          .join(", ")} at ${path}.`,
        path,
        nodeName: node.name,
      });
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
      walk(value, `${path}.${key}`, node.name, out, registry);
    }
  });
}
