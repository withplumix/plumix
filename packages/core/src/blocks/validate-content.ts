import type { BlockSpec } from "./block-registry.js";
import type { EntryContent } from "./entry-content.js";
import type { BlockNode } from "./render-block-tree.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";
import { blockSlotKeys } from "./block-slots.js";
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

/**
 * Issues use the path grammar `blocks[i]` at the root and
 * `blocks[i].<slotKey>[j]` for nested slot children.
 */
export function validateEntryContent(
  content: EntryContent,
  registry: SpecLookup,
  starting: readonly EntryContent[] = [],
  allowed?: ReadonlySet<string>,
): BlockContentValidationResult {
  const offered = (name: string): boolean =>
    Boolean(registry.get(name)) && (!allowed || allowed.has(name));
  const kept = keptAsStored(content.blocks, starting, registry, offered);
  const errors: BlockContentValidationIssue[] = [];
  walk(content.blocks, "blocks", null, errors, registry, offered, kept);
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}

const identityOf = (node: BlockNode): string => `${node.id}\u0000${node.name}`;

/** Visits every node with its issue path, in document order. */
function eachNode(
  nodes: readonly BlockNode[],
  basePath: string,
  registry: SpecLookup,
  visit: (node: BlockNode, path: string) => void,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${String(i)}]`;
    visit(node, path);
    for (const key of blockSlotKeys(node, registry.get(node.name))) {
      const value = node.attrs?.[key];
      if (isBlockNodeArray(value)) {
        eachNode(value, `${path}.${key}`, registry, visit);
      }
    }
  });
}

/**
 * The not-offered nodes `starting` already holds, by `id` and `name`, so an
 * entry keeps a block its plugin or theme dropped. Each stored node matches
 * once.
 */
function keptAsStored(
  nodes: readonly BlockNode[],
  starting: readonly EntryContent[],
  registry: SpecLookup,
  offered: (name: string) => boolean,
): ReadonlySet<string> {
  // The most any one starting content holds of an identity, not the sum: live
  // and its autosave share their nodes, and that must not allow a second copy.
  const available = new Map<string, number>();
  for (const content of starting) {
    const counts = new Map<string, number>();
    eachNode(content.blocks, "blocks", registry, (node) => {
      const identity = identityOf(node);
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    });
    for (const [identity, count] of counts) {
      available.set(identity, Math.max(available.get(identity) ?? 0, count));
    }
  }
  // By path, not by object: one object can sit in a tree twice.
  const kept = new Set<string>();
  eachNode(nodes, "blocks", registry, (node, path) => {
    if (offered(node.name)) return;
    const identity = identityOf(node);
    const left = available.get(identity) ?? 0;
    if (left === 0) return;
    available.set(identity, left - 1);
    kept.add(path);
  });
  return kept;
}

function walk(
  nodes: readonly BlockNode[],
  basePath: string,
  parentName: string | null,
  out: BlockContentValidationIssue[],
  registry: SpecLookup,
  offered: (name: string) => boolean,
  kept: ReadonlySet<string>,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    const spec = registry.get(node.name);
    if (!spec) {
      if (kept.has(path)) return;
      out.push({
        code: "unknown_block_type",
        message: `Unknown block type "${node.name}" at ${path}.`,
        path,
        nodeName: node.name,
      });
      return;
    }
    if (!offered(node.name) && !kept.has(path)) {
      out.push({
        code: "block_not_allowed",
        message: `Block "${node.name}" is not allowed by the theme at ${path}.`,
        path,
        nodeName: node.name,
      });
    }
    // The inverse of a slot's `allowedBlocks`: a parent-bound block may only
    // sit under a listed parent (and never at the top level, where parentName
    // null).
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
    for (const key of blockSlotKeys(node, spec)) {
      const value = node.attrs?.[key];
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
      walk(value, `${path}.${key}`, node.name, out, registry, offered, kept);
    }
  });
}
