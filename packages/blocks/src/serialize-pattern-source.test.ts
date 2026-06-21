import { describe, expect, test } from "vitest";

import type { BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { headingBlock } from "./heading/index.js";
import {
  block,
  commitPatterns,
  createPatternRegistry,
  definePattern,
} from "./pattern-registry.js";
import { isBlockNodeArray } from "./render-block-tree.js";
import { richTextBlock } from "./rich-text/index.js";
import { serializePatternSource } from "./serialize-pattern-source.js";

function stripIds(nodes: readonly BlockNode[]): unknown {
  return nodes.map((node) => {
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      attrs[key] = isBlockNodeArray(value) ? stripIds(value) : value;
    }
    return { name: node.name, attrs };
  });
}

function evalPatternSource(source: string): readonly BlockNode[] {
  const match = /definePattern\(([\s\S]*?)\);\n$/.exec(source);
  if (!match) throw new Error("emit shape did not match definePattern(...);");
  // Compiling the emitted snippet is the whole point of the round-trip
  // contract — eslint-disable is the price.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    "block",
    "definePattern",
    `return definePattern(${match[1]});`,
  ) as (
    b: typeof block,
    d: typeof definePattern,
  ) => {
    content: readonly BlockNode[];
  };
  return factory(block, definePattern).content;
}

describe("serializePatternSource", () => {
  test("emits a definePattern shell for an empty body", () => {
    const out = serializePatternSource([]);
    expect(out).toContain(
      'import { block, definePattern } from "plumix/blocks"',
    );
    expect(out).toContain("definePattern({");
    expect(out).toContain('name: "starter/untitled"');
    expect(out).toContain('title: "Untitled"');
    expect(out).toContain("content: [],");
  });

  test("emits one block() call per node with primitive attrs", () => {
    const out = serializePatternSource([
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2, text: "Hello", featured: true, anchor: null },
      },
    ]);
    expect(out).toContain('block("core/heading", {');
    expect(out).toContain("level: 2,");
    expect(out).toContain('text: "Hello",');
    expect(out).toContain("featured: true,");
    expect(out).toContain("anchor: null,");
  });

  test("escapes string attrs so the emitted source parses", () => {
    const out = serializePatternSource([
      {
        id: "h1",
        name: "core/heading",
        attrs: {
          text: 'He said "hi" then \\n broke',
          subtitle: "line\nbreak\ttab",
          glyph: "★ é",
        },
      },
    ]);
    expect(out).toContain('"He said \\"hi\\" then \\\\n broke"');
    expect(out).toContain('"line\\nbreak\\ttab"');
    expect(out).toContain('"★ é"');
  });

  test("renders nested slot arrays as inline block() calls", () => {
    const out = serializePatternSource([
      {
        id: "g1",
        name: "core/group",
        attrs: {
          children: [
            { id: "h1", name: "core/heading", attrs: { level: 2 } },
            {
              id: "g2",
              name: "core/group",
              attrs: {
                children: [
                  {
                    id: "p1",
                    name: "core/rich-text",
                    attrs: { html: "<p>x</p>" },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    // Outer group opens with `children: [` and contains two nested block() calls,
    // one of which is itself a group whose `children` is another nested block().
    expect(out).toContain("children: [");
    expect(out).toMatch(
      /block\("core\/group", \{[\s\S]*block\("core\/heading"/,
    );
    expect(out).toMatch(
      /block\("core\/group", \{[\s\S]*block\("core\/group", \{[\s\S]*block\("core\/rich-text"/,
    );
  });

  test("drops `id` from emitted attrs — `block()` owns IDs via the options bag", () => {
    const out = serializePatternSource([
      {
        id: "puck-0",
        name: "core/heading",
        attrs: { id: "puck-0", level: 2, text: "Hi" },
      },
    ]);
    expect(out).not.toContain("id:");
    expect(out).toContain("level: 2,");
    expect(out).toContain('text: "Hi",');
  });

  test("emits node.style via the block() options bag", () => {
    const out = serializePatternSource([
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2 },
        style: { large: { marginTop: "16px" } },
      },
    ]);
    expect(out).toMatch(
      /block\("core\/heading", \{[\s\S]*?\}, \{ style: \{[\s\S]*?"marginTop":\s*"16px"/,
    );
  });

  test("round-trips: evaluated source produces a structurally equal tree modulo IDs", () => {
    const input: readonly BlockNode[] = [
      {
        id: "h1",
        name: "core/heading",
        attrs: { level: 2, text: 'A "quoted" heading' },
      },
      {
        id: "g1",
        name: "core/group",
        attrs: {
          children: [
            {
              id: "p1",
              name: "core/rich-text",
              attrs: { html: "<p>line\nbreak</p>", emphasis: true },
            },
          ],
        },
      },
    ];
    const out = serializePatternSource(input);
    const parsed = evalPatternSource(out);
    expect(stripIds(parsed)).toEqual(stripIds(input));
  });

  test("the emitted snippet survives commitPatterns against a real block registry", () => {
    // Tree shape the editor adapter produces — both `node.id` and
    // `attrs.id` are populated, mirroring the editor's props flattening.
    const tree: readonly BlockNode[] = [
      {
        id: "puck-0",
        name: "core/heading",
        attrs: { id: "puck-0", level: 2, text: "Hello" },
      },
      {
        id: "puck-1",
        name: "core/rich-text",
        attrs: { id: "puck-1", body: "<p>Body</p>" },
      },
    ];
    const out = serializePatternSource(tree, {
      slug: "starter/round-trip",
      title: "Round trip",
    });
    const parsed = evalPatternSource(out);
    const blocks = createBlockRegistry([headingBlock, richTextBlock]);
    const pattern = definePattern({
      name: "starter/round-trip",
      title: "Round trip",
      content: parsed,
    });
    expect(() =>
      commitPatterns(createPatternRegistry([pattern]), blocks),
    ).not.toThrow();
  });
});
