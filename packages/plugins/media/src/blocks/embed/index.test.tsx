import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { embedBlock } from "./index.js";

describe("media/embed", () => {
  test("renders a lazy iframe for a safelisted provider", () => {
    const html = renderBlockSpecToHtml(embedBlock, {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(html).toContain('data-plumix-block="media/embed"');
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    );
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('data-provider="youtube"');
  });

  test("strict-sandboxes a non-safelist URL without same-origin", () => {
    const html = renderBlockSpecToHtml(embedBlock, {
      url: "https://example.com/widget",
    });
    expect(html).toContain('data-provider="generic"');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    // Untrusted host must not learn our origin.
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });

  test("does not sandbox a safelisted provider", () => {
    const html = renderBlockSpecToHtml(embedBlock, {
      url: "https://vimeo.com/123456789",
    });
    expect(html).not.toContain("sandbox=");
    expect(html).toMatch(/referrerpolicy="strict-origin-when-cross-origin"/i);
  });

  test("renders nothing for an empty or unframeable URL", () => {
    expect(renderBlockSpecToHtml(embedBlock, { url: "" })).not.toContain(
      "<iframe",
    );
    expect(
      renderBlockSpecToHtml(embedBlock, { url: "javascript:alert(1)" }),
    ).not.toContain("<iframe");
  });

  test("renders a caption when provided", () => {
    const html = renderBlockSpecToHtml(embedBlock, {
      url: "https://youtu.be/dQw4w9WgXcQ",
      caption: "Never gonna give you up",
    });
    expect(html).toContain("<figcaption>Never gonna give you up</figcaption>");
  });
});
