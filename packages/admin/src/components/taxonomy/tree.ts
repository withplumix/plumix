import type { Term } from "@plumix/core/schema";

/**
 * Hierarchical-taxonomy helpers. WordPress renders hierarchical term
 * admin as a flat list with parent-id badges; we build an actual tree
 * so the UI shows the structure at a glance (indent in the list,
 * breadcrumb in the parent picker) and client-side cycle prevention is
 * possible.
 *
 * These are pure utilities — no React, no I/O. The list route passes
 * in whatever page `term.list` returned; the tree only reflects
 * whatever's in that payload. Orphans (children whose parent isn't in
 * the set) are promoted to roots so they still render rather than
 * vanishing silently. Callers that need the full tree should fetch
 * enough rows (via a large limit) before calling these helpers.
 */

interface TermNode {
  readonly term: Term;
  readonly children: readonly TermNode[];
}

/**
 * Build a forest from a flat `Term[]`. Roots are terms with
 * `parentId == null` OR whose parent isn't present in the input (see
 * orphan-promotion note above).
 */
export function buildTermTree(terms: readonly Term[]): readonly TermNode[] {
  const byId = new Map<number, Term>();
  for (const t of terms) byId.set(t.id, t);

  const childMap = new Map<number | null, Term[]>();
  for (const t of terms) {
    // Orphan promotion: treat "parent not in the set" as root-level.
    const parentKey =
      t.parentId != null && byId.has(t.parentId) ? t.parentId : null;
    const bucket = childMap.get(parentKey) ?? [];
    bucket.push(t);
    childMap.set(parentKey, bucket);
  }

  // Sort each bucket alphabetically — matches the server's
  // `ORDER BY name ASC` for root-level terms and keeps siblings
  // predictable.
  for (const bucket of childMap.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  function build(parentId: number | null): TermNode[] {
    const bucket = childMap.get(parentId) ?? [];
    return bucket.map((t) => ({ term: t, children: build(t.id) }));
  }
  return build(null);
}

interface FlatTermNode {
  readonly term: Term;
  readonly depth: number;
}

/** DFS flatten, preserving order — for rendering an indented list. */
export function flattenTree(
  tree: readonly TermNode[],
  depth = 0,
): readonly FlatTermNode[] {
  const out: FlatTermNode[] = [];
  for (const node of tree) {
    out.push({ term: node.term, depth });
    out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}

/**
 * Collect the ids of `root` + every descendant. Used to exclude a term
 * and its subtree from the parent-picker in the edit form — setting
 * your parent to yourself or one of your descendants creates a cycle
 * the server would reject anyway, but surfacing the constraint in the
 * picker is kinder than a round-trip to a CONFLICT.
 */
export function descendantIds(
  terms: readonly Term[],
  rootId: number,
): ReadonlySet<number> {
  const tree = buildTermTree(terms);
  const ids = new Set<number>();
  function visit(nodes: readonly TermNode[]): void {
    for (const node of nodes) {
      ids.add(node.term.id);
      visit(node.children);
    }
  }
  function findAndVisit(nodes: readonly TermNode[]): boolean {
    for (const node of nodes) {
      if (node.term.id === rootId) {
        ids.add(node.term.id);
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

/**
 * Build labelled options for a `<select>` parent-picker: the term's
 * name prefixed with depth indentation (`— — Name`) so nesting is
 * visible in the flat `<option>` list. WordPress does something
 * similar but uses `&nbsp;` spaces which don't copy cleanly; we use
 * em-dashes which render identically across browsers and transcribe
 * sensibly for screen readers.
 */
export function parentPickerOptions(
  terms: readonly Term[],
  exclude: ReadonlySet<number> = new Set(),
): readonly { readonly id: number; readonly label: string }[] {
  return flattenTree(buildTermTree(terms))
    .filter((entry) => !exclude.has(entry.term.id))
    .map((entry) => ({
      id: entry.term.id,
      label:
        entry.depth === 0
          ? entry.term.name
          : `${"— ".repeat(entry.depth)}${entry.term.name}`,
    }));
}
