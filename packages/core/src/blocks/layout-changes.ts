import type { BlockInput } from "./block-registry.js";
import type { BlockSpecLookup } from "./block-slots.js";
import type { EntryContent } from "./entry-content.js";
import type { BlockNode } from "./render-block-tree.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

interface Placed {
  readonly node: BlockNode;
  readonly path: string;
  /** The parent's id and slot key; the root for a top-level node. */
  readonly container: string;
}

const ROOT = "";

/** The node fields that are layout. `label` is editor-only metadata. */
const LAYOUT_FIELDS = [
  "style",
  "hidden",
  "htmlAttrs",
  "className",
  "tagName",
] as const;

/** What a writer without `edit_layout` may change. A slot is always layout. */
export function isContentInput(input: BlockInput): boolean {
  return (
    input.content === true &&
    input.type !== "slot" &&
    input.styleProperty === undefined
  );
}

/**
 * Every layout change `content` makes from `from`: what a writer without
 * `edit_layout` may not do.
 */
export function layoutChanges(
  content: EntryContent,
  from: EntryContent,
  registry: BlockSpecLookup,
): readonly BlockContentValidationIssue[] {
  const before = placedById(from.blocks, registry);
  const after = placedById(content.blocks, registry);
  const issues: BlockContentValidationIssue[] = [];
  for (const [id, { node, path, container }] of after) {
    const was = before.get(id);
    if (!was) {
      issues.push(layoutIssue(node, path, "was inserted"));
    } else if (was.container !== container) {
      issues.push(layoutIssue(node, path, "was moved"));
    }
    if (!was) continue;
    if (was.node.name !== node.name) {
      issues.push(
        layoutIssue(node, path, `was renamed from "${was.node.name}"`),
      );
      continue;
    }
    for (const field of LAYOUT_FIELDS) {
      if (!sameJson(was.node[field], node[field])) {
        issues.push(layoutIssue(node, path, `had its ${field} changed`));
      }
    }
    for (const key of changedLayoutAttrs(was.node, node, registry)) {
      issues.push(layoutIssue(node, path, `had its "${key}" input changed`));
    }
  }
  for (const { node, path } of reordered(before, after)) {
    issues.push(layoutIssue(node, path, "was reordered"));
  }
  // At the path it held, since it has none in `content`.
  for (const [id, { node, path }] of before) {
    if (!after.has(id)) issues.push(layoutIssue(node, path, "was removed"));
  }
  return issues;
}

/**
 * Every attr but the content inputs and the slots, whose children are compared
 * as nodes. An attr no input declares counts as layout.
 */
function changedLayoutAttrs(
  was: BlockNode,
  node: BlockNode,
  registry: BlockSpecLookup,
): readonly string[] {
  const spec = registry.get(node.name);
  const skipped = new Set(blockSlotKeys(node, spec));
  for (const input of spec?.inputs ?? []) {
    if (isContentInput(input)) skipped.add(input.name);
  }
  const keys = new Set([
    ...Object.keys(was.attrs ?? {}),
    ...Object.keys(node.attrs ?? {}),
  ]);
  return [...keys].filter(
    (key) =>
      !skipped.has(key) && !sameJson(was.attrs?.[key], node.attrs?.[key]),
  );
}

/**
 * The siblings that kept their container but not their order among the others
 * that kept it, so an insert or removal beside them doesn't count.
 */
function reordered(
  before: ReadonlyMap<string, Placed>,
  after: ReadonlyMap<string, Placed>,
): readonly Placed[] {
  const stayed = (
    placed: ReadonlyMap<string, Placed>,
    other: typeof placed,
  ) => {
    const byContainer = new Map<string, string[]>();
    for (const [id, { container }] of placed) {
      if (other.get(id)?.container !== container) continue;
      const ids = byContainer.get(container) ?? [];
      ids.push(id);
      byContainer.set(container, ids);
    }
    return byContainer;
  };
  const was = stayed(before, after);
  const out: Placed[] = [];
  for (const [container, ids] of stayed(after, before)) {
    const old = was.get(container) ?? [];
    ids.forEach((id, i) => {
      const placed = after.get(id);
      if (old[i] !== id && placed) out.push(placed);
    });
  }
  return out;
}

function layoutIssue(
  node: BlockNode,
  path: string,
  change: string,
): BlockContentValidationIssue {
  return {
    code: "layout_change",
    message: `Block "${node.name}" ${change} at ${path}, which needs the edit_layout capability.`,
    path,
    nodeName: node.name,
  };
}

function placedById(
  nodes: readonly BlockNode[],
  registry: BlockSpecLookup,
): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const visit = (
    children: readonly BlockNode[],
    basePath: string,
    container: string,
  ): void => {
    children.forEach((node, i) => {
      const path = `${basePath}[${String(i)}]`;
      placed.set(node.id, { node, path, container });
      for (const key of blockSlotKeys(node, registry.get(node.name))) {
        const value = node.attrs?.[key];
        if (isBlockNodeArray(value)) {
          visit(value, `${path}.${key}`, `${node.id}\u0000${key}`);
        }
      }
    });
  };
  visit(nodes, "blocks", ROOT);
  return placed;
}

/** Key order doesn't count: a JSON round trip may change it. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item: unknown, i) => sameJson(item, b[i]))
    );
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    return false;
  }
  const aEntries = Object.entries(a);
  if (aEntries.length !== Object.keys(b).length) return false;
  return aEntries.every(
    ([key, item]) =>
      key in b && sameJson(item, (b as Record<string, unknown>)[key]),
  );
}
