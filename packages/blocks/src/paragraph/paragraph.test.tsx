import { describe, expect, test } from "vitest";

import { mockRegistry, renderBlock } from "../test/index.js";
import { paragraphBlock } from "./index.js";

describe("core/paragraph", () => {
  test("spec metadata", () => {
    expect(paragraphBlock.name).toBe("core/paragraph");
    expect(paragraphBlock.title).toBe("Paragraph");
    expect(paragraphBlock.category).toBe("text");
    expect(paragraphBlock.legacyAliases).toEqual(["paragraph"]);
  });

  test("renders <p> with text content", async () => {
    const registry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      },
    });
    expect(html).toBe("<p>Hello world</p>");
  });

  test("legacy `paragraph` content renders identically", async () => {
    const registry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Legacy content" }],
          },
        ],
      },
    });
    expect(html).toBe("<p>Legacy content</p>");
  });
});
