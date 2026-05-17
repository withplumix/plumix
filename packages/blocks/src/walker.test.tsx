import type { ReactElement } from "react";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { Node as TiptapNode } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  BlockComponent,
  BlockContext,
  BlockProps,
  TiptapNode as TiptapNodeJson,
} from "./types.js";
import type { SyncFilterExecutor } from "./walker.js";
import { defineBlock } from "./define-block.js";
import { mergeBlockRegistry } from "./registry.js";
import { defaultMarkRegistry } from "./test/index.js";
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
        markRegistry={defaultMarkRegistry}
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
    );
    expect(receivedContext).toEqual(
      expect.objectContaining({ parent: "core/container", depth: 1 }),
    );
  });

  test("block:before_render wraps every rendered block element", async () => {
    const registry = await buildRegistry();
    const hooks: SyncFilterExecutor = {
      applyFilterSync<T>(name: string, value: T): T {
        if (name !== "block:before_render") return value;
        const element = value as unknown as ReactElement;
        return createElement(
          "div",
          { "data-traced": "" },
          element,
        ) as unknown as T;
      },
    };
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "core/paragraph", content: [{ type: "text", text: "one" }] },
        { type: "core/paragraph", content: [{ type: "text", text: "two" }] },
        { type: "core/paragraph", content: [{ type: "text", text: "three" }] },
      ],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
        hooks={hooks}
      />,
    );
    expect(container.querySelectorAll("div[data-traced]").length).toBe(3);
    expect(container.innerHTML).toContain("<p>one</p>");
  });

  test("block:after_render receives block:before_render's output (order)", async () => {
    const registry = await buildRegistry();
    const calls: string[] = [];
    const hooks: SyncFilterExecutor = {
      applyFilterSync<T>(name: string, value: T): T {
        if (name === "block:before_render") {
          calls.push("before");
          return createElement(
            "section",
            { "data-before": "1" },
            value as unknown as ReactElement,
          ) as unknown as T;
        }
        if (name === "block:after_render") {
          calls.push("after");
          return createElement(
            "article",
            { "data-after": "1" },
            value as unknown as ReactElement,
          ) as unknown as T;
        }
        return value;
      },
    };
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "core/paragraph", content: [{ type: "text", text: "x" }] },
      ],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
        hooks={hooks}
      />,
    );
    expect(calls).toEqual(["before", "after"]);
    // after wraps the before-wrapped element → article > section > p
    expect(container.innerHTML).toBe(
      '<article data-after="1"><section data-before="1"><p>x</p></section></article>',
    );
  });

  test("theme block override surfaces on EntryContent output", async () => {
    const ThemeParagraph: BlockComponent = ({ children }: BlockProps) => (
      <p className="theme-mark">{children}</p>
    );
    const registry = await mergeBlockRegistry({
      core: [paragraphSpec()],
      plugins: [],
      themeOverrides: { "core/paragraph": ThemeParagraph },
      themeId: "test-theme",
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        {
          type: "core/paragraph",
          content: [{ type: "text", text: "themed" }],
        },
      ],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
    );
    expect(container.innerHTML).toBe('<p class="theme-mark">themed</p>');
  });

  test("render hooks also fire for the unknown-block fallback", async () => {
    const registry = await buildRegistry();
    const seen: string[] = [];
    const hooks: SyncFilterExecutor = {
      applyFilterSync<T>(name: string, value: T, ...rest: unknown[]): T {
        if (name === "block:before_render") {
          const [ctx] = rest as [{ node: TiptapNodeJson }];
          seen.push(ctx.node.type);
        }
        return value;
      },
    };
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "core/paragraph", content: [{ type: "text", text: "ok" }] },
        { type: "missing/x" },
      ],
    };
    render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
        hooks={hooks}
      />,
    );
    expect(seen).toEqual(["core/paragraph", "missing/x"]);
  });

  test("client-island block wraps SSR output in data-plumix-island placeholder", async () => {
    const widgetSpec = defineBlock({
      name: "demo/widget",
      title: "Widget",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({ name: "demo/widget", group: "block" }),
        ),
      component: () =>
        Promise.resolve(({ children }: BlockProps) => (
          <span data-widget="">widget-ssr{children}</span>
        )),
      client: { src: "/assets/widget.js" },
    });
    const registry = await mergeBlockRegistry({
      core: [paragraphSpec()],
      plugins: [{ spec: widgetSpec, pluginId: "demo" }],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [{ type: "demo/widget", attrs: { size: 42, title: "Hi" } }],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
    );
    const placeholder = container.querySelector(
      '[data-plumix-island="demo/widget"]',
    );
    expect(placeholder).not.toBeNull();
    const rawAttrs = placeholder?.getAttribute("data-plumix-island-attrs");
    expect(rawAttrs).not.toBeNull();
    expect(JSON.parse(rawAttrs ?? "{}")).toEqual({ size: 42, title: "Hi" });
    expect(placeholder?.querySelector("[data-widget]")).not.toBeNull();
  });

  test("client-island attrs survive an attribute-breakout attempt via JSON", async () => {
    // React escapes `"` / `<` / `>` / `&` inside HTML attribute values, so
    // an attrs payload whose values contain `" onclick="alert(1)` stays
    // confined inside `data-plumix-island-attrs` and round-trips through
    // JSON.parse on the client side. The regression here is to ensure
    // that contract is preserved if we ever swap the wrapper element or
    // serialisation strategy.
    const widgetSpec = defineBlock({
      name: "demo/widget2",
      title: "Widget",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({ name: "demo/widget2", group: "block" }),
        ),
      component: () =>
        Promise.resolve(({ children }: BlockProps) => <span>{children}</span>),
      client: { src: "/assets/widget.js" },
    });
    const registry = await mergeBlockRegistry({
      core: [paragraphSpec()],
      plugins: [{ spec: widgetSpec, pluginId: "demo" }],
      themeOverrides: {},
      themeId: null,
    });
    const hostile = '" onclick="alert(1)';
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [{ type: "demo/widget2", attrs: { title: hostile } }],
    };
    const { container } = render(
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
    );
    const placeholder = container.querySelector(
      '[data-plumix-island="demo/widget2"]',
    );
    expect(placeholder).not.toBeNull();
    expect(placeholder?.hasAttribute("onclick")).toBe(false);
    const parsed = JSON.parse(
      placeholder?.getAttribute("data-plumix-island-attrs") ?? "{}",
    ) as Record<string, unknown>;
    expect(parsed.title).toBe(hostile);
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
      <EntryContent
        content={doc}
        registry={registry}
        context={ROOT_CONTEXT}
        markRegistry={defaultMarkRegistry}
      />,
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
          markRegistry={defaultMarkRegistry}
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
