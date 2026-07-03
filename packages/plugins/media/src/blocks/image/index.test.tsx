import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { imageBlock } from "./index.js";

describe("media/image v2", () => {
  test("renders <figure><img></figure> with src + alt", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/_plumix/media/x/photo.jpg",
      alt: "A cat",
    });
    expect(html).toContain('src="/_plumix/media/x/photo.jpg"');
    expect(html).toContain('alt="A cat"');
    expect(html).toContain('loading="lazy"');
  });

  test("adds figcaption when caption is provided", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      caption: "Sunset over the bay",
    });
    expect(html).toContain("<figcaption>Sunset over the bay</figcaption>");
  });

  test("encodes focal-point as object-position style on the img", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      focalPoint: { x: 0.25, y: 0.75 },
    });
    expect(html).toMatch(/object-position:\s?25% 75%/);
  });

  test("clamps out-of-range focal-point coordinates to [0, 1]", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      focalPoint: { x: -0.5, y: 1.5 },
    });
    expect(html).toMatch(/object-position:\s?0% 100%/);
  });

  test("renders a placeholder (no <img>) for an empty src in the editor", () => {
    const html = renderBlockSpecToHtml(
      imageBlock,
      { src: "" },
      { editing: true },
    );
    expect(html).toContain("data-plumix-image-placeholder");
    expect(html).toContain("No image");
    expect(html).not.toContain("<img");
  });

  test("renders no placeholder on the public page for an empty src", () => {
    const html = renderBlockSpecToHtml(imageBlock, { src: "" });
    expect(html).not.toContain("data-plumix-image-placeholder");
    expect(html).not.toContain("No image");
  });

  test("passes sizes through to the img element", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      sizes: "(max-width: 600px) 100vw, 50vw",
    });
    expect(html).toContain('sizes="(max-width: 600px) 100vw, 50vw"');
  });

  test("high priority loads eagerly with fetchpriority=high", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      priority: true,
    });
    expect(html).toContain('loading="eager"');
    expect(html.toLowerCase()).toContain('fetchpriority="high"');
  });

  test("passes srcset through to the img element", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "/x.jpg",
      alt: "",
      srcset: "/x.jpg 1x, /x@2x.jpg 2x",
    });
    expect(html.toLowerCase()).toContain('srcset="/x.jpg 1x, /x@2x.jpg 2x"');
  });
});
