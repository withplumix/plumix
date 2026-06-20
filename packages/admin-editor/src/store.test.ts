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
});
