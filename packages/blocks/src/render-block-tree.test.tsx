import type { BlockContext } from "./types.js";
import type { BlockNode } from "./render-block-tree.js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createBlockRegistry } from "./block-registry.js";
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

const headingRegistry = createBlockRegistry([
  {
    name: "core/heading",
    render: ({ attrs }) => {
      const { text, level } = attrs as {
        readonly text: string;
        readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      };
      const Tag = `h${level}` as const;
      return <Tag>{text}</Tag>;
    },
  },
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

    expect(html).toBe(
      '<div data-plumix-block="core/heading"><h2>Hello, world</h2></div>',
    );
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

    expect(html).toBe(
      '<div data-plumix-block="core/heading"><h2>First</h2></div>' +
        '<div data-plumix-block="core/heading"><h3>Second</h3></div>' +
        '<div data-plumix-block="core/heading"><h2>Third</h2></div>',
    );
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

    expect(html).toBe(
      '<div data-plumix-block="core/heading"><h2>Before</h2></div>' +
        '<div data-plumix-block="core/heading"><h2>After</h2></div>',
    );
  });

  test("threads BlockContext through slot recursion with parent name and depth", () => {
    const captured: BlockContext[] = [];
    const registry = createBlockRegistry([
      {
        name: "acme/probe",
        render: ({ context }) => {
          captured.push(context);
          return null;
        },
      },
      {
        name: "core/section",
        render: ({ attrs }) => {
          const Content = attrs.content as () => React.ReactNode;
          return <section><Content /></section>;
        },
      },
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
    const registry = createBlockRegistry([
      {
        name: "core/heading",
        render: ({ attrs }) => {
          const { text, level } = attrs as {
            readonly text: string;
            readonly level: 1 | 2 | 3 | 4 | 5 | 6;
          };
          const Tag = `h${level}` as const;
          return <Tag>{text}</Tag>;
        },
      },
      {
        name: "core/section",
        render: ({ attrs }) => {
          const Content = attrs.content as () => React.ReactNode;
          return <section><Content /></section>;
        },
      },
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

    expect(html).toBe(
      '<div data-plumix-block="core/section"><section>' +
        '<div data-plumix-block="core/heading"><h2>Inside</h2></div>' +
        "</section></div>",
    );
  });

  test("emits per-instance <style> + class when BlockNode has a style slot and tokens are provided", () => {
    const registry = createBlockRegistry([
      {
        name: "core/paragraph",
        render: ({ attrs }) => {
          const { text } = attrs as { readonly text?: string };
          return <p>{text}</p>;
        },
      },
    ]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: { text: "Hello" },
        style: { large: { padding: "lg" } },
      },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, {
        tokens: { spacing: { lg: { value: "24px" } } },
      }),
    );

    expect(html).toContain('class="plumix-block-p1"');
    expect(html).toContain(
      "<style>.plumix-block-p1 { padding: var(--plumix-spacing-lg, 24px); }</style>",
    );
    expect(html).toContain("<p>Hello</p>");
  });

  test("omits the per-instance class when style is set but tokens are not provided", () => {
    const registry = createBlockRegistry([
      {
        name: "core/paragraph",
        render: () => <p>x</p>,
      },
    ]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1",
        name: "core/paragraph",
        attrs: {},
        style: { large: { padding: "lg" } },
      },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe('<div data-plumix-block="core/paragraph"><p>x</p></div>');
  });

  test("skips style emission when node.id contains unsafe characters", () => {
    const registry = createBlockRegistry([
      {
        name: "core/paragraph",
        render: () => <p>x</p>,
      },
    ]);
    const tree: readonly BlockNode[] = [
      {
        id: "p1</style><script>alert(1)</script>",
        name: "core/paragraph",
        attrs: {},
        style: { large: { padding: "lg" } },
      },
    ];

    const html = renderToStaticMarkup(
      renderBlockTree(tree, registry, {
        tokens: { spacing: { lg: { value: "24px" } } },
      }),
    );

    expect(html).not.toContain("<style>");
    expect(html).not.toContain("<script>");
  });

  test("omits the per-instance class when no style slot is declared", () => {
    const heading: BlockNode = {
      id: "h1",
      name: "core/heading",
      attrs: { text: "No style", level: 2 },
    };

    const html = renderToStaticMarkup(
      renderBlockTree([heading], headingRegistry),
    );

    expect(html).toBe(
      '<div data-plumix-block="core/heading"><h2>No style</h2></div>',
    );
  });

  test("skips the universal wrapper for blocks with inline: true", () => {
    const registry = createBlockRegistry([
      {
        name: "acme/carousel",
        inline: true,
        render: () => <div className="carousel-root" />,
      },
    ]);
    const tree: readonly BlockNode[] = [
      { id: "1", name: "acme/carousel", attrs: {} },
    ];

    const html = renderToStaticMarkup(renderBlockTree(tree, registry));

    expect(html).toBe('<div class="carousel-root"></div>');
    expect(html).not.toContain("data-plumix-block");
  });

  describe("render hooks", () => {
    test("fires beforeRender and afterRender around each block render", () => {
      const events: { phase: "before" | "after"; nodeName: string }[] = [];
      const tree: readonly BlockNode[] = [
        { id: "1", name: "core/heading", attrs: { text: "Hi", level: 2 } },
      ];

      renderToStaticMarkup(
        renderBlockTree(tree, headingRegistry, {
          hooks: {
            beforeRender: (node) =>
              events.push({ phase: "before", nodeName: node.name }),
            afterRender: (node) =>
              events.push({ phase: "after", nodeName: node.name }),
          },
        }),
      );

      expect(events).toEqual([
        { phase: "before", nodeName: "core/heading" },
        { phase: "after", nodeName: "core/heading" },
      ]);
    });

    test("fires hooks for unknown blocks too", () => {
      const events: string[] = [];
      const tree: readonly BlockNode[] = [
        { id: "1", name: "acme/missing", attrs: {} },
      ];

      withProductionEnv(() =>
        renderToStaticMarkup(
          renderBlockTree(tree, headingRegistry, {
            hooks: {
              beforeRender: (node) => events.push(`before:${node.name}`),
              afterRender: (node) => events.push(`after:${node.name}`),
            },
          }),
        ),
      );

      expect(events).toEqual(["before:acme/missing", "after:acme/missing"]);
    });

    test("threads the parent's context into hooks for slot children", () => {
      const captured: { name: string; parent: string | null; depth: number }[] =
        [];
      const registry = createBlockRegistry([
        {
          name: "core/section",
          render: ({ attrs }) => {
            const Content = attrs.content as () => React.ReactNode;
            return <section><Content /></section>;
          },
        },
        {
          name: "core/heading",
          render: ({ attrs }) => {
            const { text, level } = attrs as {
              readonly text: string;
              readonly level: 1 | 2 | 3 | 4 | 5 | 6;
            };
            const Tag = `h${level}` as const;
            return <Tag>{text}</Tag>;
          },
        },
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

      renderToStaticMarkup(
        renderBlockTree(tree, registry, {
          hooks: {
            beforeRender: (node, context) => {
              captured.push({
                name: node.name,
                parent: context.parent,
                depth: context.depth,
              });
            },
          },
        }),
      );

      expect(captured).toEqual([
        { name: "core/section", parent: null, depth: 0 },
        { name: "core/heading", parent: "core/section", depth: 1 },
      ]);
    });
  });

  describe("BlockNode serialization", () => {
    test("preserves unknown nodes byte-identical through JSON round-trip", () => {
      const tree: readonly BlockNode[] = [
        { id: "1", name: "core/heading", attrs: { text: "Known", level: 2 } },
        {
          id: "2",
          name: "acme/unknown",
          attrs: { foo: "bar", nested: { x: 1 } },
        },
        { id: "3", name: "core/heading", attrs: { text: "After", level: 2 } },
      ];

      const roundtripped = JSON.parse(JSON.stringify(tree)) as readonly BlockNode[];

      expect(roundtripped).toEqual(tree);
    });
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
      const registry = createBlockRegistry();

      const html = renderToStaticMarkup(renderBlockTree(blocks, registry));

      expect(html).toContain('data-plumix-unknown-block="acme/missing"');
      expect(html).toContain('data-plumix-unknown-block="acme/other"');
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
