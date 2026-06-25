import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import {
  createEditorStore,
  DESKTOP_CANVAS_WIDTH,
  deviceBucket,
  deviceWidth,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./store.js";

describe("deviceBucket", () => {
  test("maps each device to its responsive style bucket", () => {
    expect(deviceBucket("desktop")).toBe("large");
    expect(deviceBucket("tablet")).toBe("medium");
    expect(deviceBucket("mobile")).toBe("small");
  });
});

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

  test("additive select toggles a block off and repoints the active block", () => {
    const store = createEditorStore();

    store.getState().select("a");
    store.getState().select("b", { additive: true });
    // Toggle the active block (b) back off — a remains and becomes active.
    store.getState().select("b", { additive: true });

    expect([...store.getState().selectedIds]).toEqual(["a"]);
    expect(store.getState().activeId).toBe("a");
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

    store.getState().zoomToCenter(99);
    expect(store.getState().zoom).toBe(MAX_ZOOM);

    store.getState().zoomToCenter(0);
    expect(store.getState().zoom).toBe(MIN_ZOOM);
  });

  test("zoomToCenter keeps the viewport center's point fixed", () => {
    const store = createEditorStore();
    store.getState().setViewport(1000, 800);
    store.getState().setPan(0, 0);

    store.getState().zoomToCenter(2);

    expect(store.getState().zoom).toBe(2);
    // center (500,400) was world (500,400) at zoom 1; at zoom 2 it must still
    // land at the viewport center: pan = center - world*zoom.
    expect(store.getState().panX).toBe(500 - 500 * 2);
    expect(store.getState().panY).toBe(400 - 400 * 2);
  });

  test("deviceWidth: desktop is fixed; tablet/mobile track the breakpoints", () => {
    const breakpoints = { tablet: 900, mobile: 500 };
    expect(deviceWidth("desktop", breakpoints)).toBe(DESKTOP_CANVAS_WIDTH);
    expect(deviceWidth("tablet", breakpoints)).toBe(900);
    expect(deviceWidth("mobile", breakpoints)).toBe(500);
  });

  test("manual zoom turns off fit; device switch + applyFitView keep/restore it", () => {
    const store = createEditorStore();
    expect(store.getState().zoomFit).toBe(true);

    store.getState().zoomToCenter(1.5);
    expect(store.getState().zoomFit).toBe(false);

    // The canvas applies a computed fit + center without leaving fit mode...
    store.getState().enableZoomFit();
    store.getState().applyFitView({ zoom: 0.8, panX: 10, panY: 20 });
    expect(store.getState().zoom).toBe(0.8);
    expect(store.getState().panX).toBe(10);
    expect(store.getState().zoomFit).toBe(true);

    // ...and a manual zoom leaves it, while switching device restores it.
    store.getState().zoomToCenter(2);
    expect(store.getState().zoomFit).toBe(false);
    store.getState().setDevice("mobile");
    expect(store.getState().device).toBe("mobile");
    expect(store.getState().zoomFit).toBe(true);
  });

  test("breakpoints default and seed from the initializer", () => {
    expect(createEditorStore().getState().breakpoints).toEqual({
      tablet: 991,
      mobile: 640,
    });
    expect(
      createEditorStore({
        breakpoints: { tablet: 800, mobile: 400 },
      }).getState().breakpoints,
    ).toEqual({ tablet: 800, mobile: 400 });
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

describe("insertBlocks", () => {
  test("inserts multiple blocks at a top-level index and selects the first", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });

    store.getState().insertBlocks(
      [
        { id: "p1", name: "core/y" },
        { id: "p2", name: "core/z" },
      ],
      1,
    );

    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "p1", "p2"]);
    expect(store.getState().activeId).toBe("p1");
    expect([...store.getState().selectedIds]).toEqual(["p1"]);
  });

  test("is a no-op for an empty list", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/x" }];
    const store = createEditorStore({ tree });

    store.getState().insertBlocks([], 0);

    expect(store.getState().tree).toBe(tree);
  });

  test("a pattern insert is one undo step", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });
    store.getState().insertBlocks(
      [
        { id: "p1", name: "core/y" },
        { id: "p2", name: "core/z" },
      ],
      1,
    );

    store.getState().undo();
    expect(store.getState().tree.map((n) => n.id)).toEqual(["a"]);
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

describe("insertBlockInto", () => {
  const withColumns = (): ReturnType<typeof createEditorStore> =>
    createEditorStore({
      tree: [
        {
          id: "cols",
          name: "core/columns",
          attrs: { left: [{ id: "l", name: "core/x" }], right: [] },
        },
      ],
    });

  test("inserts a new block into a named slot and selects it", () => {
    const store = withColumns();
    store.getState().insertBlockInto(
      { id: "n", name: "core/heading" },
      {
        parentId: "cols",
        slotKey: "right",
        index: 0,
      },
    );

    const right = (store.getState().tree[0]?.attrs?.right as BlockNode[]).map(
      (n) => n.id,
    );
    expect(right).toEqual(["n"]);
    expect(store.getState().activeId).toBe("n");
  });

  test("rejects a block the slot does not allow (no-op)", () => {
    const store = withColumns();
    const before = store.getState().tree;

    store.getState().insertBlockInto(
      { id: "n", name: "core/button" },
      {
        parentId: "cols",
        slotKey: "right",
        index: 0,
      },
      ["core/heading"],
    );

    expect(store.getState().tree).toBe(before);
  });
});

describe("removeSelected", () => {
  test("removes every selected block and clears the selection", () => {
    const store = createEditorStore({
      tree: [
        { id: "a", name: "core/x" },
        { id: "b", name: "core/x" },
        { id: "c", name: "core/x" },
      ],
    });
    store.getState().select("a");
    store.getState().select("c", { additive: true });

    store.getState().removeSelected();

    expect(store.getState().tree.map((n) => n.id)).toEqual(["b"]);
    expect(store.getState().selectedIds.size).toBe(0);
    expect(store.getState().activeId).toBeNull();
  });

  test("is a no-op when nothing is selected", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/x" }];
    const store = createEditorStore({ tree });

    store.getState().removeSelected();

    expect(store.getState().tree).toBe(tree);
  });

  test("a removal is undoable", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });
    store.getState().select("a");

    store.getState().removeSelected();
    expect(store.getState().tree).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().tree.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("duplicateSelected", () => {
  test("clones each selected block and selects the clones", () => {
    const store = createEditorStore({
      tree: [
        { id: "a", name: "core/x" },
        { id: "b", name: "core/x" },
      ],
    });
    store.getState().select("a");

    store.getState().duplicateSelected();

    const ids = store.getState().tree.map((n) => n.id);
    expect(ids).toHaveLength(3);
    expect(ids.slice(0, 2)).toEqual(["a", store.getState().activeId]);
    // The clone, not the original, is now selected.
    expect([...store.getState().selectedIds]).toEqual([
      store.getState().activeId,
    ]);
  });

  test("is a no-op when nothing is selected", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/x" }];
    const store = createEditorStore({ tree });

    store.getState().duplicateSelected();

    expect(store.getState().tree).toBe(tree);
  });

  test("clones a container once when it and its child are both selected", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "g",
          name: "core/group",
          attrs: { content: [{ id: "child", name: "core/x" }] },
        },
      ],
    });
    store.getState().select("g");
    store.getState().select("child", { additive: true });

    store.getState().duplicateSelected();

    // Two groups total (original + one clone) — the child isn't cloned again on
    // its own, so the clone's slot holds exactly one child.
    expect(store.getState().tree).toHaveLength(2);
    const cloneId = store.getState().activeId ?? "";
    const clone = store.getState().tree.find((n) => n.id === cloneId);
    expect((clone?.attrs?.content as readonly BlockNode[]).length).toBe(1);
  });
});

describe("selectParent", () => {
  test("selects the active block's container", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "g",
          name: "core/group",
          attrs: { content: [{ id: "child", name: "core/x" }] },
        },
      ],
    });
    store.getState().select("child");

    store.getState().selectParent();

    expect(store.getState().activeId).toBe("g");
    expect([...store.getState().selectedIds]).toEqual(["g"]);
  });

  test("is a no-op for a top-level active block", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });
    store.getState().select("a");

    store.getState().selectParent();

    expect(store.getState().activeId).toBe("a");
  });
});

describe("moveSelectedBy", () => {
  test("moves the active block down among its siblings", () => {
    const store = createEditorStore({
      tree: [
        { id: "a", name: "core/x" },
        { id: "b", name: "core/x" },
      ],
    });
    store.getState().select("a");

    store.getState().moveSelectedBy(1);

    expect(store.getState().tree.map((n) => n.id)).toEqual(["b", "a"]);
  });

  test("is a no-op at the boundary", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/x" },
      { id: "b", name: "core/x" },
    ];
    const store = createEditorStore({ tree });
    store.getState().select("a");

    store.getState().moveSelectedBy(-1);

    expect(store.getState().tree).toBe(tree);
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

  test("honors an allowedBlocks list, rejecting a disallowed nest", () => {
    const tree: readonly BlockNode[] = [
      { id: "btn", name: "core/button" },
      { id: "g", name: "core/group", attrs: { content: [] } },
    ];
    const store = createEditorStore({ tree });

    store
      .getState()
      .moveBlock("btn", { parentId: "g", index: 0 }, ["core/heading"]);

    expect(store.getState().tree).toBe(tree);
  });
});

describe("move drag", () => {
  test("startMove marks the moving block; endMove clears it", () => {
    const store = createEditorStore();

    store.getState().startMove("a");
    expect(store.getState().movingId).toBe("a");

    store.getState().endMove();
    expect(store.getState().movingId).toBeNull();
  });
});

describe("updateBlockStyle", () => {
  test("sets a token style value in the given bucket", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });

    store.getState().updateBlockStyle("a", "large", "padding", { token: "lg" });

    expect(store.getState().tree[0]?.style).toEqual({
      large: { padding: { token: "lg" } },
    });
  });

  test("clears a property when the value is null, dropping empty buckets", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "a",
          name: "core/x",
          style: { large: { padding: { token: "lg" } } },
        },
      ],
    });

    store.getState().updateBlockStyle("a", "large", "padding", null);

    expect(store.getState().tree[0]?.style).toBeUndefined();
  });

  test("updates a nested block's style", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "g",
          name: "core/group",
          attrs: { content: [{ id: "c", name: "core/x" }] },
        },
      ],
    });

    store
      .getState()
      .updateBlockStyle("c", "medium", "fontSize", { raw: "20px" });

    const content = store.getState().tree[0]?.attrs?.content as BlockNode[];
    expect(content[0]?.style).toEqual({
      medium: { fontSize: { raw: "20px" } },
    });
  });

  test("is a no-op (stable tree) for an unknown block", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/x" }];
    const store = createEditorStore({ tree });

    store.getState().updateBlockStyle("nope", "large", "padding", {
      token: "lg",
    });

    expect(store.getState().tree).toBe(tree);
  });
});

describe("renameBlockStyleProperty", () => {
  test("renames a property in place, preserving its value and position", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "a",
          name: "core/x",
          style: {
            large: {
              color: { raw: "#333" },
              marginTop: { raw: "8px" },
            },
          },
        },
      ],
    });

    store
      .getState()
      .renameBlockStyleProperty("a", "large", "color", "background");

    // Value kept, order kept (background takes color's first slot).
    expect(store.getState().tree[0]?.style).toEqual({
      large: {
        background: { raw: "#333" },
        marginTop: { raw: "8px" },
      },
    });
    expect(Object.keys(store.getState().tree[0]?.style?.large ?? {})).toEqual([
      "background",
      "marginTop",
    ]);
  });

  test("is a no-op when the target name is already taken (no clobber)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "a",
        name: "core/x",
        style: {
          large: { color: { raw: "#333" }, background: { raw: "#fff" } },
        },
      },
    ];
    const store = createEditorStore({ tree });

    store
      .getState()
      .renameBlockStyleProperty("a", "large", "color", "background");

    expect(store.getState().tree).toBe(tree);
  });

  test("preserves a token value across a rename", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "a",
          name: "core/x",
          style: { large: { color: { token: "primary" } } },
        },
      ],
    });

    store
      .getState()
      .renameBlockStyleProperty("a", "large", "color", "background");

    expect(store.getState().tree[0]?.style).toEqual({
      large: { background: { token: "primary" } },
    });
  });

  test("is a no-op when the source property is missing", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/x", style: { large: { color: { raw: "#333" } } } },
    ];
    const store = createEditorStore({ tree });

    store.getState().renameBlockStyleProperty("a", "large", "nope", "gap");

    expect(store.getState().tree).toBe(tree);
  });
});

describe("xray", () => {
  test("defaults off and toggles", () => {
    const store = createEditorStore();
    expect(store.getState().xray).toBe(false);

    store.getState().toggleXray();
    expect(store.getState().xray).toBe(true);

    store.getState().toggleXray();
    expect(store.getState().xray).toBe(false);
  });
});

describe("updateBlockHtmlAttr", () => {
  test("sets an attribute on a block", () => {
    const store = createEditorStore({ tree: [{ id: "a", name: "core/x" }] });

    store.getState().updateBlockHtmlAttr("a", "id", "hero");

    expect(store.getState().tree[0]?.htmlAttrs).toEqual({ id: "hero" });
  });

  test("clears an attribute when value is null, pruning empty htmlAttrs", () => {
    const store = createEditorStore({
      tree: [{ id: "a", name: "core/x", htmlAttrs: { id: "hero" } }],
    });

    store.getState().updateBlockHtmlAttr("a", "id", null);

    expect(store.getState().tree[0]?.htmlAttrs).toBeUndefined();
  });

  test("is a no-op (stable tree) for an unknown block", () => {
    const tree: readonly BlockNode[] = [{ id: "a", name: "core/x" }];
    const store = createEditorStore({ tree });

    store.getState().updateBlockHtmlAttr("nope", "id", "x");

    expect(store.getState().tree).toBe(tree);
  });
});

describe("renameBlockHtmlAttr", () => {
  test("renames an attribute in place, preserving value and position", () => {
    const store = createEditorStore({
      tree: [
        {
          id: "a",
          name: "core/x",
          htmlAttrs: { id: "hero", "data-x": "1" },
        },
      ],
    });

    store.getState().renameBlockHtmlAttr("a", "id", "title");

    expect(store.getState().tree[0]?.htmlAttrs).toEqual({
      title: "hero",
      "data-x": "1",
    });
    expect(Object.keys(store.getState().tree[0]?.htmlAttrs ?? {})).toEqual([
      "title",
      "data-x",
    ]);
  });

  test("is a no-op when the target name is taken or the source is missing", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "a",
        name: "core/x",
        htmlAttrs: { id: "hero", title: "t" },
      },
    ];
    const store = createEditorStore({ tree });

    store.getState().renameBlockHtmlAttr("a", "id", "title");
    expect(store.getState().tree).toBe(tree);

    store.getState().renameBlockHtmlAttr("a", "nope", "role");
    expect(store.getState().tree).toBe(tree);
  });
});
