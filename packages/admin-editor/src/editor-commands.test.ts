import { describe, expect, test, vi } from "vitest";

import type { BlockNode, BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import type { EditorCommand, EditorCommandContext } from "./editor-commands.js";
import {
  buildEditorCommands,
  selectEditorCommands,
} from "./editor-commands.js";
import { createEditorStore } from "./store.js";

const spec = (over: Partial<BlockSpec> & { name: string }): BlockSpec => ({
  render: () => null,
  ...over,
});

const REGISTRY = createBlockRegistry([
  spec({ name: "core/heading", title: "Heading", icon: "Heading" }),
  spec({ name: "core/rich-text", title: "Text" }),
  spec({ name: "core/secret", title: "Secret", capability: "secret:manage" }),
]);

const TREE: readonly BlockNode[] = [
  { id: "a", name: "core/heading" },
  { id: "b", name: "core/rich-text", label: "Intro copy" },
];

function context(
  over: Partial<EditorCommandContext> = {},
): EditorCommandContext {
  return {
    store: createEditorStore({ tree: TREE }),
    registry: REGISTRY,
    capabilities: new Set<string>(),
    tree: TREE,
    ...over,
  };
}

function byId(
  commands: readonly EditorCommand[],
  id: string,
): EditorCommand | undefined {
  return commands.find((command) => command.id === id);
}

describe("buildEditorCommands", () => {
  test("covers the editor actions the palette promises", () => {
    const ids = buildEditorCommands(context()).map((command) => command.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "canvas.xray",
        "device.desktop",
        "device.tablet",
        "device.mobile",
      ]),
    );
  });

  test("toggles x-ray through the store", () => {
    const ctx = context();
    byId(buildEditorCommands(ctx), "canvas.xray")?.run();
    expect(ctx.store.getState().xray).toBe(true);
  });

  test("offers group only once the selection can take it", () => {
    const ctx = context();
    expect(byId(buildEditorCommands(ctx), "selection.group")).toBeUndefined();
    ctx.store.getState().select("a");
    ctx.store.getState().select("b", { additive: true });
    byId(buildEditorCommands(ctx), "selection.group")?.run();
    expect(ctx.store.getState().tree).toHaveLength(1);
    expect(ctx.store.getState().tree[0]?.name).toBe("core/group");
  });

  test("offers ungroup only for an active block that holds children", () => {
    const grouped: readonly BlockNode[] = [
      { id: "g", name: "core/group", attrs: { content: TREE } },
    ];
    const ctx = context({
      store: createEditorStore({ tree: grouped }),
      tree: grouped,
    });
    expect(byId(buildEditorCommands(ctx), "selection.ungroup")).toBeUndefined();
    ctx.store.getState().select("g");
    byId(buildEditorCommands(ctx), "selection.ungroup")?.run();
    expect(ctx.store.getState().tree).toHaveLength(2);
  });

  test("switches the device", () => {
    const ctx = context();
    byId(buildEditorCommands(ctx), "device.mobile")?.run();
    expect(ctx.store.getState().device).toBe("mobile");
  });

  test("offers one insert command per eligible catalog entry", () => {
    const insert = buildEditorCommands(context()).filter(
      (command) => command.group === "insert",
    );
    expect(insert.map((command) => command.id)).toContain(
      "insert:core/heading",
    );
    // Capability-gated blocks never reach the palette.
    expect(insert.map((command) => command.id)).not.toContain(
      "insert:core/secret",
    );
  });

  test("inserting appends a fresh block, selects it, and reveals it", () => {
    const ctx = context();
    byId(buildEditorCommands(ctx), "insert:core/heading")?.run();
    const { tree, activeId, frameRequest } = ctx.store.getState();
    expect(tree).toHaveLength(3);
    expect(tree[2]?.name).toBe("core/heading");
    expect(activeId).toBe(tree[2]?.id);
    expect(frameRequest).toBe(1);
  });

  test("a block's name matches, as it does in the catalog's own search", () => {
    const commands = buildEditorCommands(context());
    const hits = selectEditorCommands(commands, "core/heading", (label) =>
      typeof label === "string" ? label : (label.message ?? ""),
    );
    expect(hits.map((c) => c.id)).toContain("insert:core/heading");
  });

  test("offers one go-to command per block, named by its label", () => {
    const goto = buildEditorCommands(context()).filter(
      (command) => command.group === "goto",
    );
    expect(goto.map((command) => command.id)).toEqual(["goto:a", "goto:b"]);
    expect(byId(goto, "goto:b")?.title).toBe("Intro copy");
    expect(byId(goto, "goto:a")?.title).toBe("Heading");
  });

  test("a go-to command selects its block and asks the canvas to frame it", () => {
    const ctx = context();
    byId(buildEditorCommands(ctx), "goto:b")?.run();
    expect(ctx.store.getState().activeId).toBe("b");
    expect(ctx.store.getState().frameRequest).toBe(1);
  });

  test("offers the revisions command only when the host wires it", () => {
    expect(
      byId(buildEditorCommands(context()), "revisions.open"),
    ).toBeUndefined();
    const openRevisions = vi.fn();
    byId(
      buildEditorCommands(context({ openRevisions })),
      "revisions.open",
    )?.run();
    expect(openRevisions).toHaveBeenCalledTimes(1);
  });
});

describe("selectEditorCommands", () => {
  const toText = (label: string | { message?: string }): string =>
    typeof label === "string" ? label : (label.message ?? "");
  const command = (over: Partial<EditorCommand>): EditorCommand => ({
    id: "x",
    group: "actions",
    title: "X-ray",
    run: () => undefined,
    ...over,
  });

  test("returns everything for a blank query", () => {
    const commands = [command({ id: "a" }), command({ id: "b" })];
    expect(selectEditorCommands(commands, "  ", toText)).toHaveLength(2);
  });

  test("matches title and keywords case-insensitively", () => {
    const commands = [
      command({ id: "a", title: "Group selection" }),
      command({ id: "b", title: "Heading", keywords: ["title", "h1"] }),
    ];
    expect(
      selectEditorCommands(commands, "GROUP", toText).map((c) => c.id),
    ).toEqual(["a"]);
    expect(
      selectEditorCommands(commands, "h1", toText).map((c) => c.id),
    ).toEqual(["b"]);
  });
});
