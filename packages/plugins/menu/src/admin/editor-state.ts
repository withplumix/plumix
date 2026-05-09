import type { MenuItemMeta } from "../server/types.js";

export type ItemKey = string;

export interface EditorItem {
  readonly key: ItemKey;
  readonly id: number | null;
  readonly parentKey: ItemKey | null;
  readonly sortOrder: number;
  readonly title: string | null;
  readonly meta: MenuItemMeta;
}

export interface EditorState {
  readonly termId: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly maxDepth: number;
  readonly items: readonly EditorItem[];
  readonly selectedKey: ItemKey | null;
  readonly dirty: boolean;
  /**
   * Monotonic counter for new-item keys. `state.items.length` would
   * collide after add/add/remove/add — the third add would reuse the
   * surviving item's tmp key. Carrying a counter on state side-steps
   * that without needing a global.
   */
  readonly nextTmpId: number;
}

export const initialEditorState: EditorState = {
  termId: 0,
  slug: "",
  name: "",
  version: 0,
  maxDepth: 5,
  items: [],
  selectedKey: null,
  dirty: false,
  nextTmpId: 0,
};

interface ServerItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

interface ServerMenuResponse {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly maxDepth: number;
  readonly items: readonly ServerItemRow[];
}

export type EditorAction =
  | {
      readonly type: "loadFromServer";
      readonly response: ServerMenuResponse;
    }
  | {
      readonly type: "addItem";
      readonly title: string | null;
      readonly meta: MenuItemMeta;
    }
  | {
      readonly type: "moveUp";
      readonly key: ItemKey;
    }
  | {
      readonly type: "moveDown";
      readonly key: ItemKey;
    }
  | {
      readonly type: "updateField";
      readonly key: ItemKey;
      readonly patch: {
        readonly title?: string | null;
        readonly meta?: MenuItemMeta;
      };
    }
  | {
      readonly type: "removeItem";
      readonly key: ItemKey;
    }
  | {
      readonly type: "selectItem";
      readonly key: ItemKey | null;
    }
  | {
      readonly type: "applySaveResult";
      readonly result: {
        readonly version: number;
        readonly itemIds: readonly number[];
        /**
         * Editor item keys captured at save-mutation time. Without
         * this, ids would be zipped positionally against the current
         * items list — which drifts if the user removed/added items
         * while the save was in flight. The matched `snapshotKeys[i]`
         * receives `itemIds[i]`; keys no longer in state are skipped.
         * Optional for callers that build payloads in a single render.
         */
        readonly snapshotKeys?: readonly ItemKey[];
      };
    }
  | {
      readonly type: "demote";
      readonly key: ItemKey;
    }
  | {
      readonly type: "promote";
      readonly key: ItemKey;
    };

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "loadFromServer": {
      const items = flattenServerItems(action.response.items);
      return {
        termId: action.response.id,
        slug: action.response.slug,
        name: action.response.name,
        version: action.response.version,
        maxDepth: action.response.maxDepth,
        items,
        selectedKey: null,
        dirty: false,
        // Reset tmp counter — server-loaded items use `id-N` keys
        // exclusively, so there are no `tmp-*` collisions to worry
        // about. Subsequent addItems start fresh from 0.
        nextTmpId: 0,
      };
    }
    case "moveUp":
      return swapWithSibling(state, action.key, "previous");
    case "moveDown":
      return swapWithSibling(state, action.key, "next");
    case "updateField": {
      const items = state.items.map((item) =>
        item.key === action.key
          ? {
              ...item,
              title:
                action.patch.title === undefined
                  ? item.title
                  : action.patch.title,
              meta: action.patch.meta ?? item.meta,
            }
          : item,
      );
      return { ...state, items, dirty: true };
    }
    case "removeItem": {
      const removed = collectSubtreeKeys(state.items, action.key);
      if (removed.size === 0) return state;
      const items = state.items.filter((item) => !removed.has(item.key));
      const selectedKey =
        state.selectedKey !== null && removed.has(state.selectedKey)
          ? null
          : state.selectedKey;
      return { ...state, items, selectedKey, dirty: true };
    }
    case "selectItem":
      return { ...state, selectedKey: action.key };
    case "promote": {
      const target = state.items.find((item) => item.key === action.key);
      if (target?.parentKey == null) return state;
      const oldParent = state.items.find(
        (item) => item.key === target.parentKey,
      );
      if (!oldParent) return state;
      const newParentKey = oldParent.parentKey;
      // Slot the promoted item right after the old parent in its
      // grandparent's child list. Bumping later sortOrder values keeps
      // the relative order stable without reflowing the whole array.
      const insertAfterSortOrder = oldParent.sortOrder;
      const items = state.items.map((item) => {
        if (item.key === target.key) {
          return {
            ...item,
            parentKey: newParentKey,
            sortOrder: insertAfterSortOrder + 1,
          };
        }
        if (
          item.parentKey === newParentKey &&
          item.key !== target.key &&
          item.sortOrder > insertAfterSortOrder
        ) {
          return { ...item, sortOrder: item.sortOrder + 1 };
        }
        return item;
      });
      return { ...state, items, dirty: true };
    }
    case "demote": {
      const target = state.items.find((item) => item.key === action.key);
      if (!target) return state;
      const siblings = state.items
        .filter((item) => item.parentKey === target.parentKey)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = siblings.findIndex((s) => s.key === target.key);
      const newParent = siblings[idx - 1];
      if (!newParent) return state;
      const lastChildSortOrder = state.items
        .filter((item) => item.parentKey === newParent.key)
        .reduce((max, item) => Math.max(max, item.sortOrder), -1);
      const items = state.items.map((item) =>
        item.key === action.key
          ? {
              ...item,
              parentKey: newParent.key,
              sortOrder: lastChildSortOrder + 1,
            }
          : item,
      );
      return { ...state, items, dirty: true };
    }
    case "applySaveResult": {
      const { version, itemIds } = action.result;
      const snapshotKeys =
        action.result.snapshotKeys ?? state.items.map((item) => item.key);
      const idBySnapshotKey = new Map<ItemKey, number>();
      snapshotKeys.forEach((key, index) => {
        const id = itemIds[index];
        if (id !== undefined) idBySnapshotKey.set(key, id);
      });
      const keyRemap = new Map<ItemKey, ItemKey>();
      const items = state.items.map((item) => {
        const id = idBySnapshotKey.get(item.key) ?? item.id;
        if (id === null) return item;
        const newKey = `id-${String(id)}`;
        if (newKey !== item.key) keyRemap.set(item.key, newKey);
        return { ...item, id, key: newKey };
      });
      const remappedItems = items.map((item) =>
        item.parentKey !== null && keyRemap.has(item.parentKey)
          ? { ...item, parentKey: keyRemap.get(item.parentKey) ?? null }
          : item,
      );
      const selectedKey =
        state.selectedKey !== null
          ? (keyRemap.get(state.selectedKey) ?? state.selectedKey)
          : null;
      return {
        ...state,
        version,
        items: remappedItems,
        selectedKey,
        dirty: false,
      };
    }
    case "addItem": {
      const rootSiblings = state.items.filter(
        (item) => item.parentKey === null,
      );
      const lastRootSortOrder = rootSiblings.reduce(
        (max, item) => Math.max(max, item.sortOrder),
        -1,
      );
      const newItem: EditorItem = {
        key: `tmp-${String(state.nextTmpId)}`,
        id: null,
        parentKey: null,
        sortOrder: lastRootSortOrder + 1,
        title: action.title,
        meta: action.meta,
      };
      return {
        ...state,
        items: [...state.items, newItem],
        nextTmpId: state.nextTmpId + 1,
        dirty: true,
      };
    }
  }
}

export interface SaveItemPayload {
  readonly id?: number;
  readonly parentIndex: number | null;
  readonly sortOrder: number;
  readonly title: string | null;
  readonly meta: MenuItemMeta;
}

export function buildSavePayload(
  state: EditorState,
): readonly SaveItemPayload[] {
  const indexByKey = new Map<ItemKey, number>();
  state.items.forEach((item, index) => {
    indexByKey.set(item.key, index);
  });
  return state.items.map((item) => {
    const parentIndex =
      item.parentKey === null ? null : (indexByKey.get(item.parentKey) ?? null);
    const base: SaveItemPayload = {
      parentIndex,
      sortOrder: item.sortOrder,
      title: item.title,
      meta: item.meta,
    };
    return item.id === null ? base : { id: item.id, ...base };
  });
}

function collectSubtreeKeys(
  items: readonly EditorItem[],
  rootKey: ItemKey,
): Set<ItemKey> {
  const out = new Set<ItemKey>();
  if (!items.some((item) => item.key === rootKey)) return out;
  out.add(rootKey);
  // DFS pre-order means every descendant appears after its parent;
  // a single forward pass collects the full subtree.
  for (const item of items) {
    if (item.parentKey !== null && out.has(item.parentKey)) {
      out.add(item.key);
    }
  }
  return out;
}

function swapWithSibling(
  state: EditorState,
  key: ItemKey,
  direction: "previous" | "next",
): EditorState {
  const target = state.items.find((item) => item.key === key);
  if (!target) return state;
  // Pick the sibling adjacent in `(parentKey, sortOrder)` order rather
  // than adjacent in the array — there may be a different subtree
  // sitting between the two siblings (e.g. `[A, A.child, B]`), and
  // that's not who we want to swap with.
  const siblings = state.items
    .filter((item) => item.parentKey === target.parentKey)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = siblings.findIndex((s) => s.key === key);
  const adj = direction === "previous" ? siblings[idx - 1] : siblings[idx + 1];
  if (!adj) return state;
  const swapped = state.items.map((item) => {
    if (item.key === target.key) return { ...item, sortOrder: adj.sortOrder };
    if (item.key === adj.key) return { ...item, sortOrder: target.sortOrder };
    return item;
  });
  // Rebuild the array in DFS pre-order so descendants follow their
  // parent. `flattenSaveItems` enforces `parentIndex < itemIndex`;
  // an array-level swap leaves children stranded before the moved
  // parent and trips that check.
  return { ...state, items: rebuildDfsOrder(swapped), dirty: true };
}

function rebuildDfsOrder(items: readonly EditorItem[]): EditorItem[] {
  const childrenByParent = new Map<ItemKey | null, EditorItem[]>();
  for (const item of items) {
    const list = childrenByParent.get(item.parentKey) ?? [];
    list.push(item);
    childrenByParent.set(item.parentKey, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
    );
  }
  const out: EditorItem[] = [];
  function walk(parentKey: ItemKey | null): void {
    for (const child of childrenByParent.get(parentKey) ?? []) {
      out.push(child);
      walk(child.key);
    }
  }
  walk(null);
  return out;
}

function flattenServerItems(rows: readonly ServerItemRow[]): EditorItem[] {
  const childrenByParent = new Map<number | null, ServerItemRow[]>();
  for (const row of rows) {
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const out: EditorItem[] = [];
  function walk(parentId: number | null, parentKey: ItemKey | null): void {
    const children = childrenByParent.get(parentId) ?? [];
    for (const row of children) {
      const key = `id-${String(row.id)}`;
      out.push({
        key,
        id: row.id,
        parentKey,
        sortOrder: row.sortOrder,
        title: row.title === "" ? null : row.title,
        meta: row.meta as unknown as MenuItemMeta,
      });
      walk(row.id, key);
    }
  }
  walk(null, null);
  return out;
}
