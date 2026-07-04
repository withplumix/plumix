import type { ImageResolver } from "plumix/blocks/renderer";
import { createBlockRegistry, renderBlockTree } from "plumix/blocks";
import { PlumixProvider } from "plumix/blocks/renderer";
import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { imageBlock } from "./index.js";

// Render the block inside a PlumixProvider so its `<Image>` primitive can read
// the image-delivery resolver from context (the public + canvas render paths
// both wrap blocks in this provider).
function renderWithProvider(
  attrs: Record<string, unknown>,
  opts: { readonly resolver?: ImageResolver; readonly editing?: boolean } = {},
): string {
  const registry = createBlockRegistry([imageBlock]);
  const node = { id: "t", name: "media/image", attrs };
  return renderToStaticMarkup(
    <PlumixProvider
      value={{
        registry,
        imageResolver: opts.resolver,
        mode: opts.editing ? "edit" : "live",
      }}
    >
      {renderBlockTree([node], registry, { editing: opts.editing })}
    </PlumixProvider>,
  );
}

const widthLadder: ImageResolver = (src, o) =>
  o?.width === undefined ? src : `${src}?w=${o.width}`;

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

  test("renders from a picked media value's url", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      media: { id: "42", url: "/_plumix/media/serve/42", alt: "A dog" },
    });
    expect(html).toContain('src="/_plumix/media/serve/42"');
    expect(html).toContain('alt="A dog"');
  });

  test("the picked media alt is the default; the block alt overrides it", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      media: { id: "42", url: "/x.jpg", alt: "asset alt" },
      alt: "override alt",
    });
    expect(html).toContain('alt="override alt"');
    expect(html).not.toContain("asset alt");
  });

  test("a raw src is the escape hatch when no media is picked", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      src: "https://cdn.example/e.jpg",
      alt: "external",
    });
    expect(html).toContain('src="https://cdn.example/e.jpg"');
  });

  test("a picked media url wins over a stale raw src", () => {
    const html = renderBlockSpecToHtml(imageBlock, {
      media: { id: "42", url: "/managed.jpg", alt: "" },
      src: "https://cdn.example/old.jpg",
    });
    expect(html).toContain('src="/managed.jpg"');
    expect(html).not.toContain("old.jpg");
  });

  test("renders responsively via <Image> when the picked media has dimensions", () => {
    const html = renderWithProvider(
      {
        media: { id: "1", url: "/p.jpg", alt: "cat", width: 800, height: 600 },
        sizes: "100vw",
      },
      { resolver: widthLadder },
    );
    // Intrinsic dimensions reserve layout space (no CLS).
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
    // A generated srcset via the resolver, not the raw url.
    expect(html).toContain("/p.jpg?w=");
    expect(html.toLowerCase()).toContain("srcset=");
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

  test("honors the sizes input on the responsive image", () => {
    const html = renderWithProvider(
      {
        media: { id: "1", url: "/x.jpg", alt: "", width: 800, height: 600 },
        sizes: "(max-width: 600px) 100vw, 50vw",
      },
      { resolver: widthLadder },
    );
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

  test("falls back to a plain img (no srcset) for a dimensionless SVG", () => {
    const html = renderWithProvider(
      { media: { id: "1", url: "/logo.svg", alt: "logo" } },
      { resolver: widthLadder },
    );
    expect(html).toContain('src="/logo.svg"');
    expect(html.toLowerCase()).not.toContain("srcset=");
  });

  test("degrades to plain src with intrinsic dimensions when no resolver is set", () => {
    const html = renderWithProvider({
      media: { id: "1", url: "/p.jpg", alt: "cat", width: 800, height: 600 },
    });
    // Still emits width/height (no CLS) but no generated srcset.
    expect(html).toContain('src="/p.jpg"');
    expect(html).toContain('width="800"');
    expect(html.toLowerCase()).not.toContain("srcset=");
  });
});
