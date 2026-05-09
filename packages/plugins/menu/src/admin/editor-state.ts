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
      readonly type: "moveItem";
      readonly key: ItemKey;
      readonly newParentKey: ItemKey | null;
      readonly newSortOrder: number;
    }
  | {
      readonly type: "updateMaxDepth";
      readonly value: number;
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
    case "moveItem": {
      const target = state.items.find((item) => item.key === action.key);
      if (!target) return state;
      const updated = state.items.map((item) =>
        item.key === action.key
          ? {
              ...item,
              parentKey: action.newParentKey,
              sortOrder: action.newSortOrder,
            }
          : item,
      );
      // Re-flow newParentKey's children: drop target out, splice it in at
      // the desired index, renumber 0..n. Anyone else whose order changed
      // gets a fresh sortOrder; the rest stay put.
      const targetUpdated = updated.find((item) => item.key === action.key);
      if (!targetUpdated) return state;
      const siblings = updated
        .filter(
          (item) =>
            item.parentKey === action.newParentKey && item.key !== action.key,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);
      siblings.splice(action.newSortOrder, 0, targetUpdated);
      const newOrderByKey = new Map<ItemKey, number>();
      siblings.forEach((child, index) => {
        newOrderByKey.set(child.key, index);
      });
      const items = updated.map((item) =>
        newOrderByKey.has(item.key)
          ? {
              ...item,
              sortOrder: newOrderByKey.get(item.key) ?? item.sortOrder,
            }
          : item,
      );
      const rebuilt = rebuildDfsOrder(items);
      if (deepestDepth(rebuilt) > state.maxDepth) return state;
      return { ...state, items: rebuilt, dirty: true };
    }
    case "updateMaxDepth": {
      if (action.value < deepestDepth(state.items)) return state;
      return { ...state, maxDepth: action.value, dirty: true };
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

function deepestDepth(items: readonly EditorItem[]): number {
  // Items are in DFS pre-order, so each parent's depth is already set
  // by the time we reach its children — no second pass needed.
  const depthByKey = new Map<ItemKey, number>();
  let max = 0;
  for (const item of items) {
    const depth =
      item.parentKey === null ? 0 : (depthByKey.get(item.parentKey) ?? 0) + 1;
    depthByKey.set(item.key, depth);
    if (depth > max) max = depth;
  }
  return max;
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
