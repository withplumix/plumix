import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ResolvedBlockLoaders } from "./loaders.js";
import type { BlockContext, BlockNode } from "./render-block-tree.js";
import { createBlockRegistry } from "./block-registry.js";
import { renderBlockTree } from "./render-block-tree.js";

function withProductionEnv<T>(fn: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
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

    const html = renderToStaticMarkup(renderBlockTree(blocks, headingRegistry));

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
          return (
            <section>
              <Content />
            </section>
          );
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
          return (
            <section>
              <Content />
            </section>
          );
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

  describe("client islands (now handled by the Vite shim)", () => {
    test("does not emit any <plumix-island> wrapper from the walker", () => {
      const heading: BlockNode = {
        id: "h1",
        name: "core/heading",
        attrs: { text: "no js", level: 2 },
      };

      const html = renderToStaticMarkup(
        renderBlockTree([heading], headingRegistry),
      );

      expect(html).not.toContain("<plumix-island");
      expect(html).not.toContain("<script");
    });

    test("blocks whose render() returns plumix-island markup pass it through unchanged", () => {
      const registry = createBlockRegistry([
        {
          name: "acme/widget",
          render: () =>
            createElement(
              "plumix-island",
              {
                "chunk-url": "/w.js",
                "component-export": "Widget",
                client: "load",
                props: "{}",
                ssr: "",
              },
              createElement("span", { className: "ssr-fallback" }),
            ),
        },
      ]);
      const tree: readonly BlockNode[] = [
        { id: "w1", name: "acme/widget", attrs: {} },
      ];

      const html = renderToStaticMarkup(renderBlockTree(tree, registry));

      expect(html).toContain('<plumix-island chunk-url="/w.js"');
      expect(html).toContain('client="load"');
      expect(html).toContain("ssr-fallback");
    });
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
            return (
              <section>
                <Content />
              </section>
            );
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

      const roundtripped = JSON.parse(
        JSON.stringify(tree),
      ) as readonly BlockNode[];

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

  describe("loader data", () => {
    test("passes resolved loader data into the block's render fn", () => {
      let seen: unknown;
      const registry = createBlockRegistry([
        {
          name: "acme/needs-data",
          render: ({ loaders }) => {
            seen = loaders;
            return null;
          },
          loaders: { posts: () => Promise.resolve([]) },
        },
      ]);
      const tree: readonly BlockNode[] = [
        { id: "n1", name: "acme/needs-data", attrs: {} },
      ];
      const loaderData: ResolvedBlockLoaders = new Map([
        ["n1", { loaders: { posts: ["a", "b"] }, error: null }],
      ]);

      renderToStaticMarkup(renderBlockTree(tree, registry, { loaderData }));

      expect(seen).toEqual({ posts: ["a", "b"] });
    });

    test("passes an empty record when the resolver has no entry for the node", () => {
      let seen: unknown;
      const registry = createBlockRegistry([
        {
          name: "acme/loaderless",
          render: ({ loaders }) => {
            seen = loaders;
            return null;
          },
        },
      ]);
      const tree: readonly BlockNode[] = [
        { id: "l1", name: "acme/loaderless", attrs: {} },
      ];

      renderToStaticMarkup(renderBlockTree(tree, registry));

      expect(seen).toEqual({});
    });

    test("invokes errorFallback when the node's loader rejected", () => {
      const registry = createBlockRegistry([
        {
          name: "acme/risky",
          render: () => "should-not-render",
          errorFallback: ({ error }) => `oops: ${(error as Error).message}`,
          loaders: { v: () => Promise.resolve(null) },
        },
      ]);
      const tree: readonly BlockNode[] = [
        { id: "r1", name: "acme/risky", attrs: {} },
      ];
      const loaderData: ResolvedBlockLoaders = new Map([
        ["r1", { loaders: {}, error: new Error("boom") }],
      ]);

      const html = renderToStaticMarkup(
        renderBlockTree(tree, registry, { loaderData }),
      );

      expect(html).toContain("oops: boom");
      expect(html).not.toContain("should-not-render");
    });

    test("renders nothing in production when a loader rejected and no errorFallback is declared", () => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const registry = createBlockRegistry([
        {
          name: "acme/risky-silent",
          render: () => "should-not-render",
          loaders: { v: () => Promise.resolve(null) },
        },
      ]);
      const tree: readonly BlockNode[] = [
        { id: "r2", name: "acme/risky-silent", attrs: {} },
      ];
      const loaderData: ResolvedBlockLoaders = new Map([
        ["r2", { loaders: {}, error: new Error("boom") }],
      ]);

      const html = withProductionEnv(() =>
        renderToStaticMarkup(renderBlockTree(tree, registry, { loaderData })),
      );

      expect(html).toBe("");
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
