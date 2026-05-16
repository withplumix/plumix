import { render } from "@testing-library/react";
import { Node as TiptapNode } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  BlockComponent,
  BlockContext,
  BlockProps,
  TiptapNode as TiptapNodeJson,
} from "./types.js";
import { defineBlock } from "./define-block.js";
import { mergeBlockRegistry } from "./registry.js";
import { EntryContent } from "./walker.js";

const ROOT_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

function specForTag(opts: { name: string; tag: string; alias?: string }) {
  const Component: BlockComponent = ({ children }: BlockProps) => {
    return <div data-block={opts.name}>{children}</div>;
  };
  return defineBlock({
    name: opts.name,
    title: opts.name,
    schema: () =>
      Promise.resolve(
        TiptapNode.create({
          name: opts.name,
          group: "block",
          content: "inline*",
        }),
      ),
    component: () => Promise.resolve(Component),
    legacyAliases: opts.alias ? [opts.alias] : undefined,
  });
}

function paragraphSpec() {
  return defineBlock({
    name: "core/paragraph",
    title: "Paragraph",
    schema: () =>
      Promise.resolve(
        TiptapNode.create({
          name: "core/paragraph",
          group: "block",
          content: "inline*",
        }),
      ),
    component: () =>
      Promise.resolve(({ children }: BlockProps) => <p>{children}</p>),
    legacyAliases: ["paragraph"],
  });
}

async function buildRegistry() {
  return mergeBlockRegistry({
    core: [paragraphSpec()],
    plugins: [],
    themeOverrides: {},
    themeId: null,
  });
}

describe("EntryContent walker", () => {
  test("renders null for empty content", async () => {
    const registry = await buildRegistry();
    const { container } = render(
      <EntryContent
        content={null}
        registry={registry}
        context={ROOT_CONTEXT}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  test("renders a paragraph through the resolved component", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe("<p>Hello</p>");
  });

  test("resolves legacy alias `paragraph` to canonical `core/paragraph`", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Old content" }],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe("<p>Old content</p>");
  });

  test("wraps marks outside-in: bold + italic produce <strong><em>text</em></strong>", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "Hi",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe("<p><strong><em>Hi</em></strong></p>");
  });

  test("link mark renders an anchor with safe rel attribute", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">click</a></p>',
    );
  });

  test.each([
    { href: "mailto:a@b.com", expected: 'href="mailto:a@b.com"' },
    { href: "tel:+15551234", expected: 'href="tel:+15551234"' },
    { href: "/internal", expected: 'href="/internal"' },
    { href: "#section", expected: 'href="#section"' },
  ])("link mark allows safe scheme: $href", async ({ href, expected }) => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "go",
              marks: [{ type: "link", attrs: { href } }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toContain(expected);
  });

  test("link mark with empty href is stripped (renders bare text)", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "no link",
              marks: [{ type: "link", attrs: { href: "" } }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe("<p>no link</p>");
  });

  test("link mark with javascript: href is stripped (renders bare text)", async () => {
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [
            {
              type: "text",
              text: "evil",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.innerHTML).toBe("<p>evil</p>");
  });

  test("threads parent and depth into nested block context", async () => {
    let receivedContext: BlockContext | null = null;
    const InspectingChild: BlockComponent = ({ context }) => {
      receivedContext = context;
      return null;
    };
    const childSpec = defineBlock({
      name: "core/leaf",
      title: "Leaf",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({ name: "core/leaf", group: "block" }),
        ),
      component: () => Promise.resolve(InspectingChild),
    });
    const containerSpec = specForTag({
      name: "core/container",
      tag: "div",
    });
    const registry = await mergeBlockRegistry({
      core: [containerSpec, childSpec],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/container",
          content: [{ type: "core/leaf" }],
        },
      ],
    };
    render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(receivedContext).toEqual(
      expect.objectContaining({ parent: "core/container", depth: 1 }),
    );
  });

  test("unknown block in dev mode emits one-time warn + template marker", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = await buildRegistry();
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "missing/x" },
        { type: "missing/x" },
        { type: "missing/y" },
      ],
    };
    const { container } = render(
      <EntryContent content={doc} registry={registry} context={ROOT_CONTEXT} />,
    );
    expect(container.querySelectorAll("template").length).toBe(3);
    expect(
      container.querySelector(
        'template[data-plumix-unknown-block="missing/x"]',
      ),
    ).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("unknown block in production renders nothing", async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const registry = await buildRegistry();
      const doc: TiptapNodeJson = {
        type: "doc",
        content: [{ type: "missing/z" }],
      };
      const { container } = render(
        <EntryContent
          content={doc}
          registry={registry}
          context={ROOT_CONTEXT}
        />,
      );
      expect(container.innerHTML).toBe("");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousEnv;
      warn.mockRestore();
    }
  });
});

beforeEach(() => {
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});
