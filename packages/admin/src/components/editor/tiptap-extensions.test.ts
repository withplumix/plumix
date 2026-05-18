import { Editor, Mark } from "@tiptap/core";
import { afterEach, describe, expect, test } from "vitest";

import type { MarkRegistry, ResolvedMarkSpec } from "@plumix/blocks";
import {
  coreBlocks,
  coreMarks,
  mergeBlockRegistry,
  mergeMarkRegistry,
} from "@plumix/blocks";

import { buildTiptapExtensions } from "./tiptap-extensions.js";

function fakeMarkRegistry(specs: readonly ResolvedMarkSpec[]): MarkRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies MarkRegistry;
}

function pluginMarkSpec(
  name: string,
  registeredBy: string | null,
): ResolvedMarkSpec {
  const spec: Partial<ResolvedMarkSpec> = {
    name,
    title: name,
    schema: Mark.create({ name }),
    component: () => null,
    registeredBy,
  };
  return spec as ResolvedMarkSpec;
}

describe("buildTiptapExtensions — markRegistry", () => {
  test("appends a Tiptap mark extension for each plugin-registered mark", () => {
    const registry = fakeMarkRegistry([
      pluginMarkSpec("acme/highlight-warning", "acme"),
    ]);
    const exts = buildTiptapExtensions({ markRegistry: registry });
    expect(
      exts.some(
        (ext) => (ext as { name?: string }).name === "acme/highlight-warning",
      ),
    ).toBe(true);
  });

  test("loads every registered mark — core + plugin — so the registry is the source of truth", () => {
    const registry = fakeMarkRegistry([
      pluginMarkSpec("bold", null),
      pluginMarkSpec("acme/highlight-warning", "acme"),
    ]);
    const exts = buildTiptapExtensions({ markRegistry: registry });
    const names = exts.map((ext) => (ext as { name?: string }).name);
    expect(names).toContain("bold");
    expect(names).toContain("acme/highlight-warning");
  });

  test("emits no plugin marks when registry is omitted", () => {
    const exts = buildTiptapExtensions({});
    const names = exts.map((ext) => (ext as { name?: string }).name);
    expect(names).not.toContain("acme/highlight-warning");
  });
});

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  document.body.innerHTML = "";
});

describe("buildTiptapExtensions — canvas-mode schema is registry-sourced", () => {
  test("StarterKit's node duplicates are dropped; namespaced core blocks remain", async () => {
    const blockRegistry = await mergeBlockRegistry({
      core: coreBlocks,
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const markRegistry = await mergeMarkRegistry({
      core: coreMarks,
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const exts = buildTiptapExtensions({ blockRegistry, markRegistry });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = new Editor({ element: host, extensions: exts });
    editors.push(editor);
    const shadowed = [
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "horizontalRule",
    ];
    for (const name of shadowed) {
      expect(editor.schema.nodes[name]).toBeUndefined();
    }
    expect(editor.schema.nodes["core/paragraph"]).toBeDefined();
    expect(editor.schema.nodes["core/heading"]).toBeDefined();
    expect(editor.schema.nodes.doc).toBeDefined();
    expect(editor.schema.nodes.text).toBeDefined();
    expect(editor.schema.nodes.hardBreak).toBeDefined();
    // Empty-doc auto-fill must land on core/paragraph — production
    // callsites pass null content (e.g. the "create entry" route)
    // and ProseMirror's defaultType resolves by schema-registration
    // order. Locks in coreBlocks ordering.
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "core/paragraph" }],
    });
  });
});
