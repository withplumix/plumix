import { describe, expect, test, vi } from "vitest";

import { createBlockRegistry } from "@plumix/core/blocks";

import { treeBlocks } from "../test/tree-blocks.js";
import { createCameraStore } from "./camera-store.js";
import { canvasHandlesHostKey, runCanvasShortcut } from "./canvas-shortcuts.js";
import { layoutGate } from "./layout-gate.js";
import { createEditorStore } from "./store.js";

const noop = (): void => undefined;

describe("runCanvasShortcut", () => {
  test("selection.delete removes the selected block", () => {
    const store = createEditorStore(treeBlocks, {
      tree: [
        { id: "a", name: "core/x" },
        { id: "b", name: "core/x" },
      ],
    });
    store.getState().select("a");

    runCanvasShortcut("selection.delete", {
      store,
      camera: createCameraStore(),
      zoomToSelection: noop,
      togglePanels: noop,
    });

    expect(store.getState().tree.map((node) => node.id)).toEqual(["b"]);
  });

  test("selection.delete removes nothing for a writer without edit_layout", () => {
    const blocks = createBlockRegistry([
      {
        name: "acme/text",
        render: () => null,
        inputs: [{ name: "body", type: "text", content: true }],
      },
    ]);
    const tree = [{ id: "a", name: "acme/text" }];
    const store = createEditorStore(blocks, { tree });
    store.getState().select("a");

    runCanvasShortcut("selection.delete", {
      store,
      camera: createCameraStore(),
      zoomToSelection: noop,
      togglePanels: noop,
      layout: layoutGate(false),
    });

    expect(store.getState().tree).toEqual(tree);
  });

  test("history.undo and history.redo step through the edits", () => {
    const store = createEditorStore(treeBlocks, {
      tree: [{ id: "a", name: "core/x" }],
    });
    const deps = {
      store,
      camera: createCameraStore(),
      zoomToSelection: noop,
      togglePanels: noop,
    };
    store.getState().select("a");
    store.getState().removeSelected();

    runCanvasShortcut("history.undo", deps);
    const afterUndo = store.getState().tree.map((node) => node.id);
    runCanvasShortcut("history.redo", deps);

    expect(afterUndo).toEqual(["a"]);
    expect(store.getState().tree).toEqual([]);
  });

  test.each([
    ["canvas.xray", "xray"],
    ["help.open", "shortcutsOpen"],
    ["palette.open", "paletteOpen"],
  ] as const)("%s turns %s on", (id, flag) => {
    const store = createEditorStore(treeBlocks);

    runCanvasShortcut(id, {
      store,
      camera: createCameraStore(),
      zoomToSelection: noop,
      togglePanels: noop,
    });

    expect(store.getState()[flag]).toBe(true);
  });

  test("canvas.actualSize zooms to 100%", () => {
    const camera = createCameraStore();
    camera.getState().zoomToCenter(2);

    runCanvasShortcut("canvas.actualSize", {
      store: createEditorStore(treeBlocks),
      camera,
      zoomToSelection: noop,
      togglePanels: noop,
    });

    expect(camera.getState().zoom).toBe(1);
  });

  test("panels.toggle hands the press to the host's sidebar", () => {
    const togglePanels = vi.fn();

    runCanvasShortcut("panels.toggle", {
      store: createEditorStore(treeBlocks),
      camera: createCameraStore(),
      zoomToSelection: noop,
      togglePanels,
    });

    expect(togglePanels).toHaveBeenCalledOnce();
  });
});

describe("canvasHandlesHostKey", () => {
  test.each([
    "history.undo",
    "history.redo",
    "selection.delete",
    "panels.toggle",
    "help.open",
    "palette.open",
  ] as const)("leaves a host %s to the host", (id) => {
    expect(canvasHandlesHostKey(id)).toBe(false);
  });

  test.each(["canvas.xray", "canvas.fit"] as const)(
    "answers a host %s",
    (id) => {
      expect(canvasHandlesHostKey(id)).toBe(true);
    },
  );
});
