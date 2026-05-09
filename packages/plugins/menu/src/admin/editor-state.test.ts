import { describe, expect, test } from "vitest";

import {
  buildSavePayload,
  editorReducer,
  initialEditorState,
} from "./editor-state.js";

describe("editorReducer", () => {
  describe("loadFromServer", () => {
    test("populates termId / slug / name / version / maxDepth from the response", () => {
      const next = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 3,
          maxDepth: 4,
          items: [],
        },
      });

      expect(next.termId).toBe(7);
      expect(next.slug).toBe("main");
      expect(next.name).toBe("Main");
      expect(next.version).toBe(3);
      expect(next.maxDepth).toBe(4);
      expect(next.items).toEqual([]);
      expect(next.selectedKey).toBeNull();
      expect(next.dirty).toBe(false);
    });

    test("converts server items into editor items in (parentId, sortOrder) DFS order with stable keys", () => {
      // Server sends items already ordered by (parentId, sortOrder, id).
      // The editor stores them in DFS pre-order so parents always come
      // before children — this matches what `buildSavePayload` will emit
      // and what `flattenSaveItems` requires server-side.
      const next = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Home",
              meta: { kind: "custom", url: "/" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "About",
              meta: { kind: "custom", url: "/about" },
            },
            {
              id: 20,
              parentId: 11,
              sortOrder: 0,
              title: "Team",
              meta: { kind: "custom", url: "/about/team" },
            },
          ],
        },
      });

      expect(next.items.map((item) => item.id)).toEqual([10, 11, 20]);
      expect(next.items.map((item) => item.parentKey)).toEqual([
        null,
        null,
        next.items[1]?.key,
      ]);
      // Existing items get a key derived from their server id so save
      // round-trips can map back without ambiguity.
      expect(next.items[0]?.key).toBe("id-10");
      expect(next.items[2]?.key).toBe("id-20");
    });

    test("treats empty title as null so live-resolve fallback applies", () => {
      // Server stores `''` (the entries.title default) when a user has
      // never set a label override. The editor needs to distinguish
      // "no override" from "explicit empty string" — both round-trip
      // as null on save.
      const next = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });

      expect(next.items[0]?.title).toBeNull();
    });
  });

  describe("moveUp", () => {
    test("swaps an item with its previous sibling and updates sortOrder accordingly", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "First",
              meta: { kind: "custom", url: "/1" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "Second",
              meta: { kind: "custom", url: "/2" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "moveUp",
        key: "id-11",
      });

      expect(next.items.map((item) => item.id)).toEqual([11, 10]);
      // sortOrder reflects the new position so the next save round-trip
      // sends the order the user sees, not the order the server saw.
      expect(next.items[0]?.sortOrder).toBe(0);
      expect(next.items[1]?.sortOrder).toBe(1);
      expect(next.dirty).toBe(true);
    });

    test("moves a sibling's subtree along with it so DFS order survives", () => {
      // Regression: `[A, A.child, B]` → moveUp(B) used to leave
      // A.child stranded between B and A in the array, which then
      // produced a `forward_parent_reference` on save (A.child's
      // resolved parentIndex pointed past its own index).
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "A",
              meta: { kind: "custom", url: "/a" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "A.child",
              meta: { kind: "custom", url: "/a/c" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "B",
              meta: { kind: "custom", url: "/b" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, { type: "moveUp", key: "id-11" });

      // Order must be: B (root), A (root), A.child (under A).
      expect(next.items.map((item) => item.id)).toEqual([11, 10, 20]);
      // Every payload entry's parentIndex must reference an earlier
      // entry — that's the contract `flattenSaveItems` enforces.
      const payload = buildSavePayload(next);
      payload.forEach((entry, index) => {
        if (entry.parentIndex !== null) {
          expect(entry.parentIndex).toBeLessThan(index);
        }
      });
    });

    test("is a no-op when the item is already first among its siblings", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "First",
              meta: { kind: "custom", url: "/1" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "Second",
              meta: { kind: "custom", url: "/2" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "moveUp",
        key: "id-10",
      });

      expect(next.items.map((item) => item.id)).toEqual([10, 11]);
      expect(next.dirty).toBe(false);
    });
  });

  describe("moveDown", () => {
    test("swaps an item with its next sibling", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "First",
              meta: { kind: "custom", url: "/1" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "Second",
              meta: { kind: "custom", url: "/2" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "moveDown",
        key: "id-10",
      });

      expect(next.items.map((item) => item.id)).toEqual([11, 10]);
      expect(next.dirty).toBe(true);
    });

    test("is a no-op when the item is already last among its siblings", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Only",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "moveDown",
        key: "id-10",
      });

      expect(next.items.map((item) => item.id)).toEqual([10]);
      expect(next.dirty).toBe(false);
    });
  });

  describe("applySaveResult", () => {
    test("assigns returned ids to new items in payload order and bumps the version", () => {
      // After save, the editor must rekey new items from `tmp-*` to
      // their final `id-*` form so subsequent edits send the existing
      // id (not another insert). The server returns `itemIds[i]` aligned
      // with the input `items[i]` — same order buildSavePayload emits.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 4,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Existing",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const added = editorReducer(loaded, {
        type: "addItem",
        title: "New",
        meta: { kind: "custom", url: "/new" },
      });
      const next = editorReducer(added, {
        type: "applySaveResult",
        result: { version: 5, itemIds: [10, 99] },
      });

      expect(next.version).toBe(5);
      expect(next.items.map((item) => item.id)).toEqual([10, 99]);
      expect(next.items[1]?.key).toBe("id-99");
      expect(next.dirty).toBe(false);
    });

    test("matches ids to items by snapshot key, ignoring slots whose key was removed mid-flight", () => {
      // Regression: a positional zip between `state.items` and the
      // returned `itemIds` misaligns ids if the user removed an item
      // between firing the save and its onSuccess. Carrying the
      // snapshot keys keeps the mapping stable.
      const a = editorReducer(initialEditorState, {
        type: "addItem",
        title: "A",
        meta: { kind: "custom", url: "/a" },
      });
      const ab = editorReducer(a, {
        type: "addItem",
        title: "B",
        meta: { kind: "custom", url: "/b" },
      });
      const aKey = ab.items[0]?.key ?? "";
      const bKey = ab.items[1]?.key ?? "";
      // User removed A while the save was in flight.
      const removed = editorReducer(ab, { type: "removeItem", key: aKey });

      const next = editorReducer(removed, {
        type: "applySaveResult",
        result: {
          version: 1,
          itemIds: [10, 11],
          snapshotKeys: [aKey, bKey],
        },
      });

      // The surviving item must be tagged with its own server id, not
      // the id of the slot that vanished from state.
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.id).toBe(11);
      expect(next.items[0]?.key).toBe("id-11");
    });

    test("rewrites parentKey on descendants when the parent's tmp key becomes id", () => {
      // A newly-added parent's children carry `parentKey: tmp-N`.
      // After save, the parent's key becomes `id-X`; descendants must
      // be updated so subsequent saves serialise with the right
      // parentIndex.
      const parent = editorReducer(initialEditorState, {
        type: "addItem",
        title: "Parent",
        meta: { kind: "custom", url: "/p" },
      });
      const child = editorReducer(parent, {
        type: "addItem",
        title: "Child",
        meta: { kind: "custom", url: "/p/c" },
      });
      const childKey = child.items[1]?.key ?? "";
      const reparented = editorReducer(child, {
        type: "demote",
        key: childKey,
      });

      const next = editorReducer(reparented, {
        type: "applySaveResult",
        result: { version: 1, itemIds: [50, 51] },
      });

      expect(next.items[0]?.key).toBe("id-50");
      expect(next.items[1]?.key).toBe("id-51");
      expect(next.items[1]?.parentKey).toBe("id-50");
    });
  });

  describe("demote", () => {
    test("nests an item under its immediately-prior sibling", () => {
      // Acceptance: "promote/demote affordance moves an item between
      // parent groups". Demote = pop down a level — the item becomes
      // the last child of the sibling immediately above it.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "A",
              meta: { kind: "custom", url: "/a" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "B",
              meta: { kind: "custom", url: "/b" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, {
        type: "demote",
        key: "id-11",
      });

      expect(next.items[1]?.parentKey).toBe("id-10");
      expect(next.items[1]?.sortOrder).toBe(0);
      expect(next.dirty).toBe(true);
    });

    test("is a no-op when the item is the first among its siblings (no parent to nest under)", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "A",
              meta: { kind: "custom", url: "/a" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "demote",
        key: "id-10",
      });

      expect(next).toEqual(loaded);
    });
  });

  describe("promote", () => {
    test("pops a child up one level so its parent becomes a sibling", () => {
      // Inverse of demote — promote moves the item out of its current
      // parent's child list and into the grandparent's, positioned
      // immediately after the old parent.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "A",
              meta: { kind: "custom", url: "/a" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "A.child",
              meta: { kind: "custom", url: "/a/child" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, {
        type: "promote",
        key: "id-20",
      });

      expect(next.items[1]?.parentKey).toBeNull();
      expect(next.dirty).toBe(true);
    });

    test("is a no-op when the item is already at root", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "A",
              meta: { kind: "custom", url: "/a" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, {
        type: "promote",
        key: "id-10",
      });

      expect(next).toEqual(loaded);
    });
  });

  describe("removeItem", () => {
    test("drops the targeted item and any descendants in one shot", () => {
      // Removing a parent without the children would leave orphan rows
      // referencing a non-existent parentKey — cheaper to cascade in
      // the reducer than to discover the broken link at save time.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Parent",
              meta: { kind: "custom", url: "/parent" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "Child",
              meta: { kind: "custom", url: "/parent/child" },
            },
            {
              id: 30,
              parentId: 20,
              sortOrder: 0,
              title: "Grandchild",
              meta: { kind: "custom", url: "/parent/child/g" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "Sibling",
              meta: { kind: "custom", url: "/sibling" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, {
        type: "removeItem",
        key: "id-10",
      });

      expect(next.items.map((item) => item.id)).toEqual([11]);
      expect(next.dirty).toBe(true);
    });

    test("clears selectedKey if the selected item was removed", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Only",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const selected = editorReducer(loaded, {
        type: "selectItem",
        key: "id-10",
      });
      expect(selected.selectedKey).toBe("id-10");

      const next = editorReducer(selected, {
        type: "removeItem",
        key: "id-10",
      });

      expect(next.selectedKey).toBeNull();
    });
  });

  describe("selectItem", () => {
    test("sets selectedKey without flipping the dirty flag", () => {
      // Selection is purely UI state — selecting an item should not
      // count as an unsaved change.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Only",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });

      const next = editorReducer(loaded, {
        type: "selectItem",
        key: "id-10",
      });

      expect(next.selectedKey).toBe("id-10");
      expect(next.dirty).toBe(false);
    });
  });

  describe("updateField", () => {
    test("patches the targeted item's title and marks the state dirty", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Original",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "updateField",
        key: "id-10",
        patch: { title: "Override" },
      });

      expect(next.items[0]?.title).toBe("Override");
      expect(next.dirty).toBe(true);
    });

    test("storing null for title round-trips as null in the save payload (live-resolve fallback)", () => {
      // Acceptance: "Label override field stores `null` (not empty string)
      // when cleared, so live-resolve fallback applies." The reducer
      // accepts null directly; the call site is responsible for
      // translating `''` from the input element to `null`.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Original",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "updateField",
        key: "id-10",
        patch: { title: null },
      });

      expect(next.items[0]?.title).toBeNull();
      expect(buildSavePayload(next)[0]?.title).toBeNull();
    });

    test("patches meta (e.g. custom URL) without affecting other fields", () => {
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Site",
              meta: { kind: "custom", url: "/old" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "updateField",
        key: "id-10",
        patch: {
          meta: { kind: "custom", url: "/new", target: "_blank" },
        },
      });

      expect(next.items[0]?.meta).toEqual({
        kind: "custom",
        url: "/new",
        target: "_blank",
      });
      expect(next.items[0]?.title).toBe("Site");
    });
  });

  describe("addItem", () => {
    test("appends a new root-level item with id null and an unused tmp key", () => {
      const next = editorReducer(initialEditorState, {
        type: "addItem",
        title: "Home",
        meta: { kind: "custom", url: "/" },
      });

      expect(next.items).toHaveLength(1);
      const added = next.items[0];
      expect(added?.id).toBeNull();
      expect(added?.parentKey).toBeNull();
      expect(added?.sortOrder).toBe(0);
      expect(added?.title).toBe("Home");
      expect(added?.meta).toEqual({ kind: "custom", url: "/" });
      expect(added?.key.startsWith("tmp-")).toBe(true);
      expect(next.dirty).toBe(true);
    });

    test("never reuses a tmp key after a removeItem clears one", () => {
      // Regression: the tmp counter must be monotonic across the
      // editor's lifetime. A naive `tmp-${items.length}` collides with
      // the surviving item after an add/add/remove sequence.
      const a = editorReducer(initialEditorState, {
        type: "addItem",
        title: "A",
        meta: { kind: "custom", url: "/a" },
      });
      const ab = editorReducer(a, {
        type: "addItem",
        title: "B",
        meta: { kind: "custom", url: "/b" },
      });
      const aKey = ab.items[0]?.key ?? "";
      const bKey = ab.items[1]?.key ?? "";
      const removed = editorReducer(ab, { type: "removeItem", key: aKey });
      const c = editorReducer(removed, {
        type: "addItem",
        title: "C",
        meta: { kind: "custom", url: "/c" },
      });

      const newKey = c.items[1]?.key ?? "";
      expect(newKey).not.toBe(aKey);
      expect(newKey).not.toBe(bKey);
    });

    test("appends after the last existing root-level item with sortOrder = prior+1", () => {
      // The flat-list interim treats "add" as "append at the end of the
      // root group". Slice 9's drag-drop changes how items move into
      // child groups; for now everything new lands at the root.
      const loaded = editorReducer(initialEditorState, {
        type: "loadFromServer",
        response: {
          id: 1,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "First",
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
      });
      const next = editorReducer(loaded, {
        type: "addItem",
        title: "Second",
        meta: { kind: "custom", url: "/two" },
      });

      expect(next.items).toHaveLength(2);
      expect(next.items[1]?.sortOrder).toBe(1);
      expect(next.items[1]?.parentKey).toBeNull();
    });
  });
});

describe("buildSavePayload", () => {
  test("emits an empty array when no items have been loaded or added", () => {
    // The save endpoint accepts `items: []` (e.g. after the user
    // removes everything). Building from a freshly-created menu with no
    // items must round-trip through `menu.save` cleanly.
    expect(buildSavePayload(initialEditorState)).toEqual([]);
  });

  test("emits one new custom-URL item with parentIndex null and no id", () => {
    // The server's save accepts items with optional `id` (omitted for
    // new) and `parentIndex` referencing earlier indexes. A single new
    // root item should serialise with no id and parentIndex null.
    const state = editorReducer(initialEditorState, {
      type: "addItem",
      title: "Home",
      meta: { kind: "custom", url: "/" },
    });

    const payload = buildSavePayload(state);

    expect(payload).toEqual([
      {
        parentIndex: null,
        sortOrder: 0,
        title: "Home",
        meta: { kind: "custom", url: "/" },
      },
    ]);
  });

  test("preserves an existing item's id so the server treats it as an update", () => {
    const state = editorReducer(initialEditorState, {
      type: "loadFromServer",
      response: {
        id: 1,
        slug: "main",
        name: "Main",
        version: 4,
        maxDepth: 5,
        items: [
          {
            id: 42,
            parentId: null,
            sortOrder: 0,
            title: "About",
            meta: { kind: "entry", entryId: 99 },
          },
        ],
      },
    });

    const payload = buildSavePayload(state);

    expect(payload).toEqual([
      {
        id: 42,
        parentIndex: null,
        sortOrder: 0,
        title: "About",
        meta: { kind: "entry", entryId: 99 },
      },
    ]);
  });

  test("translates parentKey into parentIndex referring to an earlier output index", () => {
    // `flattenSaveItems` requires `parentIndex < itemIndex`. Editor
    // items are stored in DFS order so parents always precede children;
    // buildSavePayload preserves that order and looks up each parent's
    // index in the output array.
    const state = editorReducer(initialEditorState, {
      type: "loadFromServer",
      response: {
        id: 1,
        slug: "main",
        name: "Main",
        version: 1,
        maxDepth: 5,
        items: [
          {
            id: 10,
            parentId: null,
            sortOrder: 0,
            title: "Parent",
            meta: { kind: "custom", url: "/parent" },
          },
          {
            id: 20,
            parentId: 10,
            sortOrder: 0,
            title: "Child",
            meta: { kind: "custom", url: "/parent/child" },
          },
        ],
      },
    });

    const payload = buildSavePayload(state);

    expect(payload[0]?.parentIndex).toBeNull();
    expect(payload[1]?.parentIndex).toBe(0);
  });
});
