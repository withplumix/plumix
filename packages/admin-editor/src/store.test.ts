import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { createEditorStore, MAX_ZOOM, MIN_ZOOM } from "./store.js";

describe("editor store", () => {
  test("select replaces the selection and marks the block active", () => {
    const store = createEditorStore();

    store.getState().select("a");
    expect(store.getState().activeId).toBe("a");
    expect([...store.getState().selectedIds]).toEqual(["a"]);

    store.getState().select("b");
    expect(store.getState().activeId).toBe("b");
    expect([...store.getState().selectedIds]).toEqual(["b"]);
  });

  test("additive select extends the set, keeping the latest as active", () => {
    const store = createEditorStore();

    store.getState().select("a");
    store.getState().select("b", { additive: true });

    expect([...store.getState().selectedIds].sort()).toEqual(["a", "b"]);
    expect(store.getState().activeId).toBe("b");
  });

  test("clearSelection empties the set and the active block", () => {
    const store = createEditorStore();
    store.getState().select("a");

    store.getState().clearSelection();

    expect(store.getState().activeId).toBeNull();
    expect(store.getState().selectedIds.size).toBe(0);
  });

  test("zoom is clamped to the allowed range", () => {
    const store = createEditorStore();

    store.getState().setZoom(99);
    expect(store.getState().zoom).toBe(MAX_ZOOM);

    store.getState().setZoom(0);
    expect(store.getState().zoom).toBe(MIN_ZOOM);
  });

  test("setTree replaces the canonical tree", () => {
    const store = createEditorStore();
    const tree: readonly BlockNode[] = [{ id: "x", name: "core/heading" }];

    store.getState().setTree(tree);

    expect(store.getState().tree).toBe(tree);
  });

  test("updateBlockAttrs merges a patch into the targeted block's attrs", () => {
    const store = createEditorStore({
      tree: [
        { id: "h1", name: "core/heading", attrs: { level: 2, text: "Hi" } },
      ],
    });

    store.getState().updateBlockAttrs("h1", { text: "Hello" });

    const [block] = store.getState().tree;
    // Patch merges over existing attrs — `level` survives, `text` changes.
    expect(block?.attrs).toEqual({ level: 2, text: "Hello" });
  });

  test("updateBlockAttrs reaches a block nested inside a slot", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "group",
          name: "core/group",
          attrs: {
            content: [
              { id: "child", name: "core/heading", attrs: { text: "old" } },
            ],
          },
        },
      ],
    });

    store.getState().updateBlockAttrs("child", { text: "new" });

    const child = (
      store.getState().tree[0]?.attrs?.content as readonly BlockNode[]
    )[0];
    expect(child?.attrs).toEqual({ text: "new" });
  });

  test("updateBlockAttrs leaves untouched blocks referentially stable", () => {
    const sibling: BlockNode = { id: "b", name: "core/spacer" };
    const store = createEditorStore({
      tree: [{ id: "a", name: "core/heading", attrs: { text: "x" } }, sibling],
    });

    store.getState().updateBlockAttrs("a", { text: "y" });

    // The edited block is a new object; the sibling reference is preserved so
    // React skips re-rendering it.
    expect(store.getState().tree[1]).toBe(sibling);
  });

  test("updateBlockAttrs is a no-op when the id is absent", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/heading" }];
    const store = createEditorStore({ tree });

    store.getState().updateBlockAttrs("missing", { text: "y" });

    expect(store.getState().tree).toBe(tree);
  });
});

describe("insertBlock", () => {
  test("inserts a block at the given top-level index and selects it", () => {
    const store = createEditorStore({
      tree: [
        { id: "a", name: "core/heading" },
        { id: "b", name: "core/spacer" },
      ],
    });

    store.getState().insertBlock({ id: "new", name: "core/rich-text" }, 1);

    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "new", "b"]);
    // The freshly inserted block becomes the active selection.
    expect(store.getState().activeId).toBe("new");
    expect([...store.getState().selectedIds]).toEqual(["new"]);
  });

  test("clamps an out-of-range index to the ends", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });

    store.getState().insertBlock({ id: "head", name: "core/y" }, -5);
    store.getState().insertBlock({ id: "tail", name: "core/z" }, 99);

    expect(store.getState().tree.map((n) => n.id)).toEqual([
      "head",
      "a",
      "tail",
    ]);
  });

  test("inserts into an empty tree", () => {
    const store = createEditorStore();

    store.getState().insertBlock({ id: "first", name: "core/heading" }, 0);

    expect(store.getState().tree.map((n) => n.id)).toEqual(["first"]);
  });
});

describe("undo / redo", () => {
  test("undo reverts an insert; redo replays it", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });

    store.getState().insertBlock({ id: "b", name: "core/y" }, 1);
    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "b"]);

    store.getState().undo();
    expect(store.getState().tree.map((n) => n.id)).toEqual(["a"]);

    store.getState().redo();
    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("a typing burst on one field collapses into one undo step", () => {
    const store = createEditorStore({
      tree: [{ id: "h", name: "core/heading", attrs: { text: "" } }],
    });

    store.getState().updateBlockAttrs("h", { text: "H" });
    store.getState().updateBlockAttrs("h", { text: "He" });
    store.getState().updateBlockAttrs("h", { text: "Hey" });

    // One undo jumps back past the whole burst to the original.
    store.getState().undo();
    expect(store.getState().tree[0]?.attrs?.text).toBe("");
  });

  test("a new edit after undo drops the redo", () => {
    const store = createEditorStore({ tree: [] });
    store.getState().insertBlock({ id: "a", name: "core/x" }, 0);
    store.getState().undo();
    store.getState().insertBlock({ id: "b", name: "core/y" }, 0);

    store.getState().redo();
    // Redo was cleared by the post-undo edit; the tree stays at [b].
    expect(store.getState().tree.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("moveBlock action", () => {
  test("reorders the tree through the store", () => {
    const store = createEditorStore({
      tree: [
        { id: "a", name: "core/x" },
        { id: "b", name: "core/x" },
      ],
    });

    store.getState().moveBlock("a", { parentId: null, index: 1 });

    expect(store.getState().tree.map((n) => n.id)).toEqual(["b", "a"]);
  });
});
