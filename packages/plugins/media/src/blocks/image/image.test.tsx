import { mockRegistry, renderBlock } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { imageBlock } from "./index.js";

describe("media/image", () => {
  test("renders <figure><img alt><figcaption /> with the supplied attrs", async () => {
    const registry = await mockRegistry({ core: [imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/image",
            attrs: {
              src: "/_plumix/media/abc/cover.jpg",
              alt: "Cover photo",
              caption: "Photo by Ada",
            },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-plumix-block="media/image"');
    expect(html).toContain('alt="Cover photo"');
    expect(html).toContain('src="/_plumix/media/abc/cover.jpg"');
    expect(html).toContain("<figcaption>Photo by Ada</figcaption>");
  });

  test("omits the figcaption when caption is empty", async () => {
    const registry = await mockRegistry({ core: [imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/image",
            attrs: { src: "/x.jpg", alt: "" },
            content: [],
          },
        ],
      },
    });
    expect(html).not.toContain("figcaption");
  });

  test("encodes focalPoint into object-position inline style", async () => {
    const registry = await mockRegistry({ core: [imageBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/image",
            attrs: {
              src: "/x.jpg",
              alt: "x",
              focalPoint: { x: 0.25, y: 0.75 },
            },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain("object-position");
    expect(html).toContain("25% 75%");
  });

  test("declares a client island module so the SSR shell emits a bootstrap", () => {
    expect(imageBlock.client?.src).toBe(
      "/_plumix/admin/assets/media-image.client.js",
    );
  });

  test("declares supports for spacing/border/anchor/customClassName", () => {
    expect(imageBlock.supports).toMatchObject({
      spacing: { padding: true, margin: true },
      border: { radius: true },
      anchor: true,
      customClassName: true,
    });
  });
});
