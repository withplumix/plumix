import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { listItemBlock } from "./list-item.js";
import { listOrderedBlock } from "./list-ordered.js";
import { listBlock } from "./list.js";

describe("core/list (bullet)", () => {
  test("renders as <ul> wrapping list-item children", async () => {
    const registry = await mockRegistry({
      core: [listBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list",
            content: [
              {
                type: "core/list-item",
                content: [{ type: "text", text: "one" }],
              },
              {
                type: "core/list-item",
                content: [{ type: "text", text: "two" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  test('legacy `type: "bulletList"` content renders identically', async () => {
    const registry = await mockRegistry({
      core: [listBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "text", text: "Legacy" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe("<ul><li>Legacy</li></ul>");
  });
});

describe("core/list-ordered", () => {
  test("renders as <ol> wrapping list-item children", async () => {
    const registry = await mockRegistry({
      core: [listOrderedBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list-ordered",
            content: [
              {
                type: "core/list-item",
                content: [{ type: "text", text: "one" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe("<ol><li>one</li></ol>");
  });

  test("propagates start attribute", async () => {
    const registry = await mockRegistry({
      core: [listOrderedBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list-ordered",
            attrs: { start: 5 },
            content: [
              {
                type: "core/list-item",
                content: [{ type: "text", text: "x" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain('start="5"');
  });

  test("propagates reversed attribute when true", async () => {
    const registry = await mockRegistry({
      core: [listOrderedBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list-ordered",
            attrs: { reversed: true },
            content: [
              {
                type: "core/list-item",
                content: [{ type: "text", text: "x" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain("reversed");
  });

  test("omits start attribute when 1 (default)", async () => {
    const registry = await mockRegistry({
      core: [listOrderedBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list-ordered",
            attrs: { start: 1 },
            content: [
              {
                type: "core/list-item",
                content: [{ type: "text", text: "x" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).not.toContain("start=");
  });

  test('legacy `type: "orderedList"` content renders identically', async () => {
    const registry = await mockRegistry({
      core: [listOrderedBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { start: 3 },
            content: [
              {
                type: "listItem",
                content: [{ type: "text", text: "Legacy" }],
              },
            ],
          },
        ],
      },
    });
    expect(html).toBe('<ol start="3"><li>Legacy</li></ol>');
  });
});

describe("core/list-item", () => {
  test("renders as <li> with inline children", async () => {
    const registry = await mockRegistry({
      core: [listBlock, listItemBlock],
    });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/list-item",
            content: [{ type: "text", text: "hello" }],
          },
        ],
      },
    });
    expect(html).toBe("<li>hello</li>");
  });
});
