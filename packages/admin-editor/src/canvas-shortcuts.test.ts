import { describe, expect, test, vi } from "vitest";

import { treeBlocks } from "../test/tree-blocks.js";
import { createCameraStore } from "./camera-store.js";
import { canvasHandlesHostKey, runCanvasShortcut } from "./canvas-shortcuts.js";
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

  test("panels.toggle shows or hides the panels", () => {
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
  // The host's own listeners answer these; answering again would act twice.
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
