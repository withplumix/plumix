import type { Entry } from "@plumix/core/schema";

interface EntryNode {
  readonly entry: Entry;
  readonly children: readonly EntryNode[];
}

const UNTITLED_PLACEHOLDER = "(no title)";

function entryLabel(entry: Entry): string {
  const trimmed = entry.title.trim();
  return trimmed.length > 0 ? trimmed : UNTITLED_PLACEHOLDER;
}

// Orphans (children whose parent isn't in the input set) get promoted
// to roots so a paginated `entry.list` page never silently drops rows.
export function buildEntryTree(entries: readonly Entry[]): readonly EntryNode[] {
  const byId = new Map<number, Entry>();
  for (const e of entries) byId.set(e.id, e);

  const childMap = new Map<number | null, Entry[]>();
  for (const e of entries) {
    const parentKey =
      e.parentId != null && byId.has(e.parentId) ? e.parentId : null;
    const bucket = childMap.get(parentKey) ?? [];
    bucket.push(e);
    childMap.set(parentKey, bucket);
  }

  for (const bucket of childMap.values()) {
    bucket.sort((a, b) => entryLabel(a).localeCompare(entryLabel(b)));
  }

  function build(parentId: number | null): EntryNode[] {
    const bucket = childMap.get(parentId) ?? [];
    return bucket.map((e) => ({ entry: e, children: build(e.id) }));
  }
  return build(null);
}

interface FlatEntryNode {
  readonly entry: Entry;
  readonly depth: number;
}

export function flattenTree(
  tree: readonly EntryNode[],
  depth = 0,
): readonly FlatEntryNode[] {
  const out: FlatEntryNode[] = [];
  for (const node of tree) {
    out.push({ entry: node.entry, depth });
    out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}

export function descendantIds(
  entries: readonly Entry[],
  rootId: number,
): ReadonlySet<number> {
  const tree = buildEntryTree(entries);
  const ids = new Set<number>();
  function visit(nodes: readonly EntryNode[]): void {
    for (const node of nodes) {
      ids.add(node.entry.id);
      visit(node.children);
    }
  }
  function findAndVisit(nodes: readonly EntryNode[]): boolean {
    for (const node of nodes) {
      if (node.entry.id === rootId) {
        ids.add(node.entry.id);
        visit(node.children);
        return true;
      }
      if (findAndVisit(node.children)) return true;
    }
    return false;
  }
  findAndVisit(tree);
  return ids;
}

export interface ParentPickerOption {
  readonly id: number;
  readonly label: string;
}

export function parentPickerOptions(
  entries: readonly Entry[],
  exclude: ReadonlySet<number> = new Set(),
): readonly ParentPickerOption[] {
  return flattenTree(buildEntryTree(entries))
    .filter((entry) => !exclude.has(entry.entry.id))
    .map((entry) => ({
      id: entry.entry.id,
      label:
        entry.depth === 0
          ? entryLabel(entry.entry)
          : `${"— ".repeat(entry.depth)}${entryLabel(entry.entry)}`,
    }));
}
