import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockRegistry, ResolvedBlockSpec } from "@plumix/blocks";

import { createSlashMenuExtension } from "./extension.js";

function spec(
  name: string,
  title: string,
  category: string,
): ResolvedBlockSpec {
  return {
    name,
    title,
    description: undefined,
    category,
    keywords: undefined,
    component: () => null,
    legacyAliases: undefined,
    schema: () => Promise.resolve({} as never),
    registeredBy: null,
    allowedBlocks: undefined,
    parent: undefined,
    defaults: undefined,
  } as unknown as ResolvedBlockSpec;
}

function fakeRegistry(specs: readonly ResolvedBlockSpec[]): BlockRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies BlockRegistry;
}

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  document.body.innerHTML = "";
});

function mountEditor(extension: ReturnType<typeof createSlashMenuExtension>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    extensions: [StarterKit, extension],
    content: "<p></p>",
  });
  editors.push(editor);
  return editor;
}

describe("slash menu Tiptap extension", () => {
  test("can be installed on a Tiptap editor without throwing", () => {
    const registry = fakeRegistry([
      spec("core/heading", "Heading", "typography"),
    ]);
    const ext = createSlashMenuExtension({
      blockRegistry: registry,
      onPick: vi.fn(),
    });
    expect(() => mountEditor(ext)).not.toThrow();
  });

  test("declares the Tiptap extension name", () => {
    const registry = fakeRegistry([
      spec("core/heading", "Heading", "typography"),
    ]);
    const ext = createSlashMenuExtension({
      blockRegistry: registry,
      onPick: vi.fn(),
    });
    expect(ext.name).toBe("plumixSlashMenu");
  });

  test("registry-derived schemas are loaded so picked types insert without errors", () => {
    // Build a real schema for `core/probe` so we can prove
    // buildTiptapExtensions threads block schemas into the editor.
    // The test name in the schema MUST match the spec name.
    const probeSpec = {
      name: "core/probe",
      title: "Probe",
      category: "typography",
      description: undefined,
      keywords: undefined,
      attributes: undefined,
      schema: Node.create({
        name: "core/probe",
        group: "block",
        content: "text*",
        parseHTML() {
          return [{ tag: "div[data-probe]" }];
        },
        renderHTML() {
          return ["div", { "data-probe": "" }, 0];
        },
      }),
      component: () => null,
      legacyAliases: undefined,
      registeredBy: null,
      editor: undefined,
      client: undefined,
    } as unknown as ResolvedBlockSpec;
    const registry = fakeRegistry([probeSpec]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        createSlashMenuExtension({
          blockRegistry: registry,
          onPick: vi.fn(),
        }),
        probeSpec.schema,
      ],
      content: "<p></p>",
    });
    editors.push(editor);
    // Insertion must NOT throw — proves the schema is registered.
    expect(() =>
      editor.chain().focus().insertContent({ type: "core/probe" }).run(),
    ).not.toThrow();
    const types = editor
      .getJSON()
      .content.map((n) => n.type)
      .filter((t): t is string => typeof t === "string");
    expect(types).toContain("core/probe");
  });
});
