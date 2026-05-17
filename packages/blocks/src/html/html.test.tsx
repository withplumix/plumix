import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { htmlBlock } from "./index.js";

describe("core/html", () => {
  test("emits the html attribute verbatim inside a marker div", async () => {
    const registry = await mockRegistry({ core: [htmlBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/html",
            attrs: { html: "<custom-widget data-x='1'></custom-widget>" },
          },
        ],
      },
    });
    expect(html).toBe(
      "<div data-plumix-block=\"core/html\"><custom-widget data-x='1'></custom-widget></div>",
    );
  });

  test("renders an empty marker div when html attr is missing or non-string", async () => {
    const registry = await mockRegistry({ core: [htmlBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          { type: "core/html" },
          { type: "core/html", attrs: { html: 42 } },
        ],
      },
    });
    expect(html).toBe(
      '<div data-plumix-block="core/html"></div><div data-plumix-block="core/html"></div>',
    );
  });
});
