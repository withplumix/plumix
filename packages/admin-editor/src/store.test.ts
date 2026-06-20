import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { createEditorStore, findBlock, MAX_ZOOM, MIN_ZOOM } from "./store.js";

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

describe("findBlock", () => {
  test("finds a top-level block by id", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading" },
      { id: "b", name: "core/spacer" },
    ];
    expect(findBlock(tree, "b")?.name).toBe("core/spacer");
  });

  test("finds a block nested inside a slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "g",
        name: "core/group",
        attrs: { content: [{ id: "deep", name: "core/heading" }] },
      },
    ];
    expect(findBlock(tree, "deep")?.id).toBe("deep");
  });

  test("returns undefined when absent", () => {
    expect(findBlock([{ id: "a", name: "core/heading" }], "z")).toBeUndefined();
  });
});
