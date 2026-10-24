import { describe, expect, test } from "vitest";

import type { BlockNode } from "@plumix/core/blocks";

import { treeBlocks } from "../test/tree-blocks.js";
import { createClipboardOps, pasteableAtRoot } from "./clipboard-ops.js";
import { parseClipboardBlocks } from "./clipboard.js";
import { createEditorStore } from "./store.js";

/** In-memory clipboard so the ops are testable without the browser API. */
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
  { id: "a", name: "acme/team", attrs: { text: "Hi" } },
  { id: "b", name: "core/group" },
];

describe("clipboard ops", () => {
  test("copy writes the selected blocks to the clipboard", async () => {
    const store = createEditorStore(treeBlocks, { tree: seeded() });
    store.getState().select("a");
    const clip = fakeClipboard();

    await createClipboardOps(store, treeBlocks, clip).copy();

    expect(parseClipboardBlocks(clip.text())?.map((n) => n.id)).toEqual(["a"]);
  });

  test("copy with nothing selected leaves the clipboard untouched", async () => {
    const store = createEditorStore(treeBlocks, { tree: seeded() });
    const clip = fakeClipboard("prior");

    await createClipboardOps(store, treeBlocks, clip).copy();

    expect(clip.text()).toBe("prior");
  });

  test("cut copies then removes the selected blocks", async () => {
    const store = createEditorStore(treeBlocks, { tree: seeded() });
    store.getState().select("a");
    const clip = fakeClipboard();

    await createClipboardOps(store, treeBlocks, clip).cut();

    expect(parseClipboardBlocks(clip.text())?.map((n) => n.id)).toEqual(["a"]);
    expect(store.getState().tree.map((n) => n.id)).toEqual(["b"]);
  });

  test("paste inserts the clipboard blocks with fresh ids", async () => {
    const store = createEditorStore(treeBlocks);
    const clip = fakeClipboard();
    // Seed the clipboard via a copy from another store.
    const source = createEditorStore(treeBlocks, { tree: seeded() });
    source.getState().select("a");
    await createClipboardOps(source, treeBlocks, clip).copy();

    await createClipboardOps(store, treeBlocks, clip).paste();

    const tree = store.getState().tree;
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("acme/team");
    expect(tree[0]?.id).not.toBe("a");
  });

  test("paste ignores clipboard text that isn't a plumix payload", async () => {
    const store = createEditorStore(treeBlocks, { tree: seeded() });
    const clip = fakeClipboard("copied from somewhere else");

    await createClipboardOps(store, treeBlocks, clip).paste();

    expect(store.getState().tree.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("paste drops nodes the canPaste predicate rejects", async () => {
    const clip = fakeClipboard();
    const source = createEditorStore(treeBlocks, {
      tree: [{ id: "col", name: "acme/team" }],
    });
    source.getState().select("col");
    await createClipboardOps(source, treeBlocks, clip).copy();

    const store = createEditorStore(treeBlocks);
    // e.g. core/column requiresParent → can't land at the top level.
    await createClipboardOps(
      store,
      treeBlocks,
      clip,
      (n) => n.name !== "acme/team",
    ).paste();

    expect(store.getState().tree).toHaveLength(0);
  });

  test("copy leaves the clipboard untouched for a selection holding an unregistered block", async () => {
    const store = createEditorStore(treeBlocks, {
      tree: [
        {
          id: "g",
          name: "core/group",
          attrs: { content: [{ id: "o", name: "acme/gone" }] },
        },
      ],
    });
    store.getState().select("g");
    const clip = fakeClipboard("prior");

    await createClipboardOps(store, treeBlocks, clip).cut();

    expect(clip.text()).toBe("prior");
    expect(store.getState().tree.map((n) => n.id)).toEqual(["g"]);
  });

  test("pasteableAtRoot refuses a block this site doesn't register", () => {
    const pasteable = pasteableAtRoot(treeBlocks);

    expect(pasteable({ id: "o", name: "acme/gone" })).toBe(false);
    expect(
      pasteable({
        id: "g",
        name: "core/group",
        attrs: { content: [{ id: "o", name: "acme/gone" }] },
      }),
    ).toBe(false);
    expect(pasteable({ id: "t", name: "acme/team" })).toBe(true);
  });
});
