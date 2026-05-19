import type { BlockContext } from "./types.js";
import type { BlockNode, BlockNodeRegistry } from "./render-block-tree.js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderBlockTree } from "./render-block-tree.js";

function withProductionEnv<T>(fn: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

const headingRegistry: BlockNodeRegistry = new Map([
  [
    "core/heading",
    ({ attrs }) => {
      const { text, level } = attrs as {
        readonly text: string;
        readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      };
      const Tag = `h${level}` as const;
      return <Tag>{text}</Tag>;
    },
  ],
]);

describe("renderBlockTree", () => {
  test("renders a single heading block with its text attribute", () => {
    const heading: BlockNode = {
      id: "abc",
      name: "core/heading",
      attrs: { text: "Hello, world", level: 2 },
    };

    const html = renderToStaticMarkup(
      renderBlockTree([heading], headingRegistry),
    );

    expect(html).toBe("<h2>Hello, world</h2>");
  });

  test("renders multiple sibling blocks in document order", () => {
    const blocks: readonly BlockNode[] = [
      { id: "1", name: "core/heading", attrs: { text: "First", level: 2 } },
      { id: "2", name: "core/heading", attrs: { text: "Second", level: 3 } },
      { id: "3", name: "core/heading", attrs: { text: "Third", level: 2 } },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(blocks, headingRegistry),
    );

    expect(html).toBe("<h2>First</h2><h3>Second</h3><h2>Third</h2>");
  });

  test("renders nothing for an unknown block name in production", () => {
    const unknown: BlockNode = {
      id: "x",
      name: "acme/missing",
      attrs: { foo: "bar" },
    };

    const html = withProductionEnv(() =>
      renderToStaticMarkup(renderBlockTree([unknown], headingRegistry)),
    );

    expect(html).toBe("");
  });

  test("renders nothing for an empty node array", () => {
    const html = renderToStaticMarkup(renderBlockTree([], headingRegistry));

    expect(html).toBe("");
  });

  test("known blocks render around unknown blocks in production", () => {
    const blocks: readonly BlockNode[] = [
      { id: "1", name: "core/heading", attrs: { text: "Before", level: 2 } },
      { id: "2", name: "acme/missing", attrs: {} },
      { id: "3", name: "core/heading", attrs: { text: "After", level: 2 } },
    ];

    const html = withProductionEnv(() =>
      renderToStaticMarkup(renderBlockTree(blocks, headingRegistry)),
    );

    expect(html).toBe("<h2>Before</h2><h2>After</h2>");
  });

  test("threads BlockContext through slot recursion with parent name and depth", () => {
    const captured: BlockContext[] = [];
    const registry: BlockNodeRegistry = new Map([
      [
        "acme/probe",
        ({ context }) => {
          captured.push(context);
          return null;
        },
      ],
      [
        "core/section",
        ({ attrs }) => {
          const Content = attrs.content as () => React.ReactNode;
          return <section><Content /></section>;
        },
      ],
    ]);

    const tree: readonly BlockNode[] = [
      { id: "1", name: "acme/probe", attrs: {} },
      {
        id: "2",
        name: "core/section",
        attrs: {
          content: [{ id: "3", name: "acme/probe", attrs: {} }],
        },
      },
    ];

    renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(captured).toHaveLength(2);
    expect(captured[0]?.parent).toBe(null);
    expect(captured[0]?.depth).toBe(0);
    expect(captured[1]?.parent).toBe("core/section");
    expect(captured[1]?.depth).toBe(1);
  });

  test("materializes a slot field in attrs as a Component the block invokes", () => {
    const registry: BlockNodeRegistry = new Map([
      [
        "core/heading",
        ({ attrs }) => {
          const { text, level } = attrs as {
            readonly text: string;
            readonly level: 1 | 2 | 3 | 4 | 5 | 6;
          };
          const Tag = `h${level}` as const;
          return <Tag>{text}</Tag>;
        },
      ],
      [
        "core/section",
        ({ attrs }) => {
          const Content = attrs.content as () => React.ReactNode;
          return <section><Content /></section>;
        },
      ],
    ]);

    const tree: readonly BlockNode[] = [
      {
        id: "1",
        name: "core/section",
        attrs: {
          content: [
            {
              id: "2",
              name: "core/heading",
              attrs: { text: "Inside", level: 2 },
            },
          ],
        },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe("<section><h2>Inside</h2></section>");
  });

  describe("in development", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("emits an unknown-block template marker and warns once per name", () => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const blocks: readonly BlockNode[] = [
        { id: "1", name: "acme/missing", attrs: {} },
        { id: "2", name: "acme/missing", attrs: {} },
        { id: "3", name: "acme/other", attrs: {} },
      ];
      const registry: BlockNodeRegistry = new Map();

      const html = renderToStaticMarkup(renderBlockTree(blocks, registry));

      expect(html).toContain('data-plumix-unknown-block="acme/missing"');
      expect(html).toContain('data-plumix-unknown-block="acme/other"');
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
