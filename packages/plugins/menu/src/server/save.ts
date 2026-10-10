import type { MenuTargetLookups } from "./resolveItemStates.js";
import type {
  MenuItemEntryMeta,
  MenuItemMeta,
  MenuItemTermMeta,
} from "./types.js";
import { MenuPluginError } from "../errors.js";

/**
 * `parentIndex` must be less than the item's own index, or `null` for a root,
 * so new items without ids can be saved in one round-trip. Omit `id` for new
 * items.
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
 * Structural only, no DB access: the caller must already have loaded the term
 * row for the optimistic-lock check.
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

export function resolveParentIds(
  items: readonly FlattenedItem[],
  resolvedIds: readonly number[],
): readonly (number | null)[] {
  if (items.length !== resolvedIds.length) {
    throw MenuPluginError.resolveParentIdsLengthMismatch({
      itemsLength: items.length,
      resolvedIdsLength: resolvedIds.length,
    });
  }
  return items.map((item) => {
    if (item.resolvedParentIndex === null) return null;
    return resolvedIds[item.resolvedParentIndex] ?? null;
  });
}

/**
 * A field the lookup leaves empty isn't written. An unresolved target keeps
 * `stored`'s snapshot if `stored` links the same target.
 */
export function withTargetSnapshot(
  meta: MenuItemMeta,
  targets: MenuTargetLookups,
  stored: MenuItemMeta | null,
): MenuItemMeta {
  if (meta.kind === "custom") return meta;
  const result = targets.resultFor(meta);
  if (result === null) {
    return isSameTarget(meta, stored)
      ? {
          ...meta,
          ...(stored.lastLabel ? { lastLabel: stored.lastLabel } : {}),
          ...(stored.lastHref ? { lastHref: stored.lastHref } : {}),
        }
      : meta;
  }
  return {
    ...meta,
    ...(result.label ? { lastLabel: result.label } : {}),
    ...(result.href ? { lastHref: result.href } : {}),
  };
}

function isSameTarget<T extends MenuItemEntryMeta | MenuItemTermMeta>(
  meta: T,
  stored: MenuItemMeta | null,
): stored is T {
  if (meta.kind === "entry") {
    return stored?.kind === "entry" && stored.entryId === meta.entryId;
  }
  return stored?.kind === "term" && stored.termId === meta.termId;
}
