import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock, stripBlockMarkers } from "../test/index.js";
import { detailsBlock } from "./index.js";

describe("core/details", () => {
  test("renders <details><summary> with the summary attribute", async () => {
    const registry = await mockRegistry({ core: [detailsBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/details",
            attrs: { summary: "Click to expand" },
            content: [],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toBe(
      '<details><summary>Click to expand</summary></details>',
    );
  });

  test("falls back to a default summary when summary attr is missing", async () => {
    const registry = await mockRegistry({ core: [detailsBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "core/details", content: [] }],
      },
    });
    expect(stripBlockMarkers(html)).toContain("<summary>Details</summary>");
  });

  test("emits open attribute when open=true", async () => {
    const registry = await mockRegistry({ core: [detailsBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/details",
            attrs: { open: true, summary: "Open by default" },
            content: [],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).toContain("<details");
    expect(stripBlockMarkers(html)).toContain("open=");
  });

  test("escapes summary HTML — no XSS via summary attr", async () => {
    const registry = await mockRegistry({ core: [detailsBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/details",
            attrs: { summary: "<script>alert(1)</script>" },
            content: [],
          },
        ],
      },
    });
    expect(stripBlockMarkers(html)).not.toContain("<script>");
    expect(stripBlockMarkers(html)).toContain("&lt;script&gt;");
  });

  test("declares summary (text) + open (boolean) attributes for the Inspector", () => {
    expect(detailsBlock.attributes?.summary).toMatchObject({ type: "text" });
    expect(detailsBlock.attributes?.open).toMatchObject({
      type: "boolean",
      default: false,
    });
  });

  test("declares supports for color/spacing/border/anchor/customClassName", () => {
    expect(detailsBlock.supports).toEqual({
      color: { background: true },
      spacing: { padding: true, margin: true },
      border: { radius: true },
      anchor: true,
      customClassName: true,
    });
  });
});
