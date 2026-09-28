import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ImageResolver, RemotePattern } from "./image-attrs.js";
import { createBlockRegistry } from "../block-registry.js";
import { Image, PlumixProvider } from "./index.js";

const registry = createBlockRegistry([]);
const resolver: ImageResolver = (src, opts) =>
  opts?.width === undefined ? src : `${src}?w=${opts.width}`;

function render(
  node: React.ReactNode,
  value?: {
    imageResolver?: ImageResolver;
    imageRemotePatterns?: readonly RemotePattern[];
  },
): string {
  return renderToStaticMarkup(
    <PlumixProvider value={{ registry, ...value }}>{node}</PlumixProvider>,
  );
}

describe("Image", () => {
  test("renders a responsive optimized img with lazy/async defaults", () => {
    const html = render(
      <Image src="/a.jpg" alt="A cat" width={400} height={300} />,
      {
        imageResolver: resolver,
      },
    );
    expect(html).toContain('src="/a.jpg?w=400"');
    expect(html).toContain('srcSet="/a.jpg?w=400 1x, /a.jpg?w=800 2x"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="400"');
    expect(html).toContain('height="300"');
    expect(html).toContain('alt="A cat"');
  });

  test("priority makes the image eager + high-priority and emits a preload link", () => {
    const html = render(
      <Image src="/a.jpg" alt="Hero" width={400} height={300} priority />,
      { imageResolver: resolver },
    );
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('decoding="sync"');
    expect(html).toContain('rel="preload"');
    expect(html).toContain('as="image"');
    expect(html).toContain('imageSrcSet="/a.jpg?w=400 1x, /a.jpg?w=800 2x"');
  });

  test("non-priority images stay lazy with no preload link", () => {
    const html = render(
      <Image src="/a.jpg" alt="A" width={400} height={300} />,
      {
        imageResolver: resolver,
      },
    );
    expect(html).not.toContain('rel="preload"');
    expect(html).toContain('loading="lazy"');
  });

  test("a caller's loading overrides the priority default", () => {
    const html = render(
      <Image
        src="/a.jpg"
        alt="A"
        width={400}
        height={300}
        priority
        loading="lazy"
      />,
      { imageResolver: resolver },
    );
    expect(html).toContain('loading="lazy"');
  });

  test("priority on an unoptimizable source preloads by href, no imageSrcSet", () => {
    const html = render(
      <Image src="/logo.svg" alt="Logo" width={64} height={64} priority />,
      { imageResolver: resolver },
    );
    expect(html).toContain('rel="preload"');
    expect(html).toContain('href="/logo.svg"');
    expect(html).not.toContain("imageSrcSet");
  });
});

describe("Image — passthrough + unoptimizable", () => {
  test("passes through an unauthorized source: no srcset, keeps dims + lazy", () => {
    const html = render(
      <Image
        src="https://evil.com/x.jpg"
        alt=""
        width={50}
        height={50}
        quality={80}
        densities={[1, 2]}
      />,
      {
        imageResolver: resolver,
        imageRemotePatterns: [{ hostname: "cdn.ok.com" }],
      },
    );
    expect(html).toContain('src="https://evil.com/x.jpg"');
    expect(html).not.toContain("srcSet");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="50"');
    // internal-only props must not leak onto the DOM
    expect(html).not.toContain("quality");
    expect(html).not.toContain("densities");
  });

  test("emits a width srcset with sizes and passes through class", () => {
    const html = render(
      <Image
        src="/a.jpg"
        alt="A"
        width={400}
        height={300}
        sizes="100vw"
        className="hero"
      />,
      { imageResolver: resolver },
    );
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('srcSet="/a.jpg?w=400 400w');
    expect(html).toContain('class="hero"');
  });
});
