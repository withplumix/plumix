import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { listBlockV2, listItemBlockV2 } from "./v2.js";

describe("core/list v2", () => {
  test("renders an empty <ul> for the bullet variant (default)", () => {
    const html = renderBlockSpecToHtml(listBlockV2, {});
    expect(html).toBe('<div data-plumix-block="core/list"><ul></ul></div>');
  });

  test("renders an empty <ol> when the numbered variant is selected", () => {
    const html = renderBlockSpecToHtml(listBlockV2, { variant: "numbered" });
    expect(html).toBe('<div data-plumix-block="core/list"><ol></ol></div>');
  });

  test("renders the start attribute on the numbered variant when greater than 1", () => {
    const html = renderBlockSpecToHtml(listBlockV2, {
      variant: "numbered",
      start: 5,
    });
    expect(html).toContain('<ol start="5">');
  });

  test("drops the start attribute when it equals the canonical default of 1", () => {
    const html = renderBlockSpecToHtml(listBlockV2, {
      variant: "numbered",
      start: 1,
    });
    expect(html).not.toContain("start=");
  });

  test("ignores invalid start values (zero, negative, fractional, NaN, Infinity, non-number)", () => {
    for (const start of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const html = renderBlockSpecToHtml(listBlockV2, {
        variant: "numbered",
        start,
      });
      expect(html).not.toContain("start=");
    }
    expect(
      renderBlockSpecToHtml(listBlockV2, {
        variant: "numbered",
        start: "5",
      }),
    ).not.toContain("start=");
  });

  test("ignores the start attribute on the bullet variant", () => {
    const html = renderBlockSpecToHtml(listBlockV2, { start: 5 });
    expect(html).toBe('<div data-plumix-block="core/list"><ul></ul></div>');
  });

  test("renders a list-item as inline <li> (no universal wrapper)", () => {
    const html = renderBlockSpecToHtml(listItemBlockV2, { text: "Bullet" });
    expect(html).toBe("<li>Bullet</li>");
  });

  test("li nests as a direct child of <ul> via the items slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "l1",
        name: "core/list",
        attrs: {
          items: [
            { id: "i1", name: "core/list-item", attrs: { text: "A" } },
            { id: "i2", name: "core/list-item", attrs: { text: "B" } },
          ],
        },
      },
    ];
    const html = renderBlockTreeToHtml(
      [listBlockV2, listItemBlockV2],
      tree,
    );
    expect(html).toContain("<ul><li>A</li><li>B</li></ul>");
  });

  test("li nests as a direct child of <ol> with the start attribute preserved", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "o1",
        name: "core/list",
        attrs: {
          variant: "numbered",
          start: 3,
          items: [{ id: "i1", name: "core/list-item", attrs: { text: "x" } }],
        },
      },
    ];
    const html = renderBlockTreeToHtml(
      [listBlockV2, listItemBlockV2],
      tree,
    );
    expect(html).toContain('<ol start="3"><li>x</li></ol>');
  });

  test("declares Bullet and Numbered variations", () => {
    expect(listBlockV2.variations?.map((v) => v.slug)).toEqual([
      "bullet",
      "numbered",
    ]);
  });
});
