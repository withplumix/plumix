import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/blocks";

import { createClipboardOps } from "./clipboard-ops.js";
import { parseClipboardBlocks } from "./clipboard.js";
import { createEditorStore } from "./store.js";

// In-memory clipboard so the ops are testable without the browser API.
function fakeClipboard(initial = "") {
  let text = initial;
  return {
    text: () => text,
    // eslint-disable-next-line @typescript-eslint/require-await
    async readText() {
      return text;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async writeText(next: string) {
      text = next;
    },
  };
}

const seeded = (): readonly BlockNode[] => [
  { id: "a", name: "core/heading", attrs: { text: "Hi" } },
  { id: "b", name: "core/text" },
];

describe("clipboard ops", () => {
  test("copy writes the selected blocks to the clipboard", async () => {
    const store = createEditorStore({ tree: seeded() });
    store.getState().select("a");
    const clip = fakeClipboard();

    await createClipboardOps(store, clip).copy();

    expect(parseClipboardBlocks(clip.text())?.map((n) => n.id)).toEqual(["a"]);
  });

  test("copy with nothing selected leaves the clipboard untouched", async () => {
    const store = createEditorStore({ tree: seeded() });
    const clip = fakeClipboard("prior");

    await createClipboardOps(store, clip).copy();

    expect(clip.text()).toBe("prior");
  });

  test("cut copies then removes the selected blocks", async () => {
    const store = createEditorStore({ tree: seeded() });
    store.getState().select("a");
    const clip = fakeClipboard();

    await createClipboardOps(store, clip).cut();

    expect(parseClipboardBlocks(clip.text())?.map((n) => n.id)).toEqual(["a"]);
    expect(store.getState().tree.map((n) => n.id)).toEqual(["b"]);
  });

  test("paste inserts the clipboard blocks with fresh ids", async () => {
    const store = createEditorStore();
    const clip = fakeClipboard();
    // Seed the clipboard via a copy from another store.
    const source = createEditorStore({ tree: seeded() });
    source.getState().select("a");
    await createClipboardOps(source, clip).copy();

    await createClipboardOps(store, clip).paste();

    const tree = store.getState().tree;
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("core/heading");
    expect(tree[0]?.id).not.toBe("a");
  });

  test("paste ignores clipboard text that isn't a plumix payload", async () => {
    const store = createEditorStore({ tree: seeded() });
    const clip = fakeClipboard("copied from somewhere else");

    await createClipboardOps(store, clip).paste();

    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("paste drops nodes the canPaste predicate rejects", async () => {
    const clip = fakeClipboard();
    const source = createEditorStore({
      tree: [{ id: "col", name: "core/column" }],
    });
    source.getState().select("col");
    await createClipboardOps(source, clip).copy();

    const store = createEditorStore();
    // e.g. core/column requiresParent → can't land at the top level.
    await createClipboardOps(
      store,
      clip,
      (n) => n.name !== "core/column",
    ).paste();

    expect(store.getState().tree).toHaveLength(0);
  });
});
