import type { MenuItemMeta } from "./types.js";

/**
 * Save-protocol input for a single menu item. `parentIndex` references
 * another item's position in the same `items` array — must be strictly
 * less than the item's own index, or `null` for root-level items. This
 * lets the client send a freshly-mutated tree (including newly-created
 * items that don't have ids yet) in one payload without the server
 * needing two round-trips for id assignment.
 *
 * `id` is omitted for new items (the save will allocate ids); existing
 * items pass their current id so the server diffs against the prior
 * set.
 */
export interface SaveItemInput {
  readonly id?: number;
  readonly parentIndex: number | null;
  readonly sortOrder: number;
  readonly title: string | null;
  readonly meta: MenuItemMeta;
}

interface FlattenedItem {
  readonly index: number;
  readonly id: number | null;
  readonly resolvedParentIndex: number | null;
  readonly depth: number;
  readonly sortOrder: number;
  readonly title: string | null;
  readonly meta: MenuItemMeta;
}

interface MaxDepthExceeded {
  readonly kind: "max_depth_exceeded";
  readonly index: number;
  readonly depth: number;
  readonly maxDepth: number;
}

interface ForwardParentReference {
  readonly kind: "forward_parent_reference";
  readonly index: number;
  readonly parentIndex: number;
}

interface ParentIndexOutOfRange {
  readonly kind: "parent_index_out_of_range";
  readonly index: number;
  readonly parentIndex: number;
}

interface SelfParentReference {
  readonly kind: "self_parent_reference";
  readonly index: number;
}

type FlattenError =
  | MaxDepthExceeded
  | ForwardParentReference
  | ParentIndexOutOfRange
  | SelfParentReference;

type FlattenResult =
  | { readonly ok: true; readonly items: readonly FlattenedItem[] }
  | { readonly ok: false; readonly error: FlattenError };

/**
 * Validate the save-protocol payload and compute each item's depth,
 * rejecting forward references, self-parents, out-of-range parent
 * indexes, and depth violations. Returns a flat array preserving the
 * input order so the persistence layer can iterate once.
 *
 * All validation is structural (no DB access) — the caller is expected
 * to have already loaded the term row for the optimistic-lock check.
 */
export function flattenSaveItems(
  items: readonly SaveItemInput[],
  options: { readonly maxDepth: number },
): FlattenResult {
  const out: FlattenedItem[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;

    const parentIndex = item.parentIndex;
    if (parentIndex !== null) {
      if (parentIndex === index) {
        return { ok: false, error: { kind: "self_parent_reference", index } };
      }
      if (parentIndex < 0 || parentIndex >= items.length) {
        return {
          ok: false,
          error: { kind: "parent_index_out_of_range", index, parentIndex },
        };
      }
      if (parentIndex > index) {
        return {
          ok: false,
          error: { kind: "forward_parent_reference", index, parentIndex },
        };
      }
    }

    const parentDepth =
      parentIndex === null ? -1 : (out[parentIndex]?.depth ?? -1);
    const depth = parentDepth + 1;
    if (depth >= options.maxDepth) {
      return {
        ok: false,
        error: {
          kind: "max_depth_exceeded",
          index,
          depth,
          maxDepth: options.maxDepth,
        },
      };
    }

    out.push({
      index,
      id: item.id ?? null,
      resolvedParentIndex: parentIndex,
      depth,
      sortOrder: item.sortOrder,
      title: item.title,
      meta: item.meta,
    });
  }
  return { ok: true, items: out };
}

/**
 * Resolve `parentIndex` into the eventual `parentId` after the persistence
 * layer has assigned ids to new items. The caller passes a parallel array
 * of resolved ids (one per flattened item, in input order) and gets back
 * an array of `parentId` values aligned with the same order.
 */
export function resolveParentIds(
  items: readonly FlattenedItem[],
  resolvedIds: readonly number[],
): readonly (number | null)[] {
  if (items.length !== resolvedIds.length) {
    throw new Error(
      `resolveParentIds: items.length (${items.length}) does not match resolvedIds.length (${resolvedIds.length})`,
    );
  }
  return items.map((item) => {
    if (item.resolvedParentIndex === null) return null;
    return resolvedIds[item.resolvedParentIndex] ?? null;
  });
}
