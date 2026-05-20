import {
  renderBlockSpecToHtml,
  renderBlockTreeToHtml,
} from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { imageBlock } from "../image/index.js";
import { galleryBlock } from "./index.js";

describe("media/gallery v2", () => {
  test("renders an empty grid with default 3 columns", () => {
    const html = renderBlockSpecToHtml(galleryBlock, {});
    expect(html).toContain('data-plumix-block="media/gallery"');
    expect(html).toContain('data-columns="3"');
  });

  test("emits data-aspect when a valid ratio is provided", () => {
    const html = renderBlockSpecToHtml(galleryBlock, { aspect: "16:9" });
    expect(html).toContain('data-aspect="16:9"');
  });

  test("omits data-aspect when the value is missing or invalid", () => {
    const empty = renderBlockSpecToHtml(galleryBlock, {});
    const bogus = renderBlockSpecToHtml(galleryBlock, { aspect: "nope" });
    expect(empty).not.toContain("data-aspect");
    expect(bogus).not.toContain("data-aspect");
  });

  test("clamps invalid column counts into the supported range", () => {
    const tooMany = renderBlockSpecToHtml(galleryBlock, { columns: 99 });
    const tooFew = renderBlockSpecToHtml(galleryBlock, { columns: 0 });
    expect(tooMany).toContain('data-columns="8"');
    expect(tooFew).toContain('data-columns="1"');
  });

  test("renders nested media/image children from the content slot", () => {
    const html = renderBlockTreeToHtml(
      [galleryBlock, imageBlock],
      [
        {
          id: "g1",
          name: "media/gallery",
          attrs: {
            columns: 2,
            content: [
              {
                id: "i1",
                name: "media/image",
                attrs: { src: "/a.jpg", alt: "A" },
              },
              {
                id: "i2",
                name: "media/image",
                attrs: { src: "/b.jpg", alt: "B" },
              },
            ],
          },
        },
      ],
    );
    expect(html).toContain('data-columns="2"');
    expect(html).toContain('src="/a.jpg"');
    expect(html).toContain('src="/b.jpg"');
  });
});
