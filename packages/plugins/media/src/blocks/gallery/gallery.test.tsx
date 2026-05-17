import { mockRegistry, renderBlock } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { imageBlock } from "../image/index.js";
import { galleryBlock } from "./index.js";

describe("media/gallery", () => {
  test("renders a div wrapping image children with data-columns/data-aspect/data-gap", async () => {
    const registry = await mockRegistry({ core: [galleryBlock, imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/gallery",
            attrs: { columns: 4, aspect: "16:9", gap: "1rem" },
            content: [
              { type: "media/image", attrs: { src: "/a.jpg", alt: "" } },
              { type: "media/image", attrs: { src: "/b.jpg", alt: "" } },
            ],
          },
        ],
      },
    });
    expect(html).toContain('data-plumix-block="media/gallery"');
    expect(html).toContain('data-columns="4"');
    expect(html).toContain('data-aspect="16:9"');
    expect(html).toContain('data-gap="1rem"');
    // Children: two img tags.
    expect(html.match(/<img/g)?.length).toBe(2);
  });

  test("clamps columns into [1, 8]", async () => {
    const registry = await mockRegistry({ core: [galleryBlock, imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/gallery",
            attrs: { columns: 99 },
            content: [{ type: "media/image", attrs: { src: "/a.jpg" } }],
          },
        ],
      },
    });
    expect(html).toContain('data-columns="8"');
  });

  test("ignores malformed aspect strings rather than leaking them", async () => {
    const registry = await mockRegistry({ core: [galleryBlock, imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/gallery",
            attrs: { aspect: "lol" },
            content: [{ type: "media/image", attrs: { src: "/a.jpg" } }],
          },
        ],
      },
    });
    expect(html).not.toContain("data-aspect");
  });
});
