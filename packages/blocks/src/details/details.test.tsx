import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
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
    expect(html).toBe(
      '<details data-plumix-block="core/details"><summary>Click to expand</summary></details>',
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
    expect(html).toContain("<summary>Details</summary>");
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
    expect(html).toContain("<details");
    expect(html).toContain("open=");
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
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
