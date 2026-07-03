import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { embedBlock } from "./index.js";

describe("core/embed", () => {
  test("renders a click-to-load facade, not a live iframe, on the server", () => {
    const html = renderBlockSpecToHtml(embedBlock, {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "My clip",
    });
    expect(html).toContain('data-provider="youtube"');
    expect(html).toContain("plumix-embed-facade");
    // The whole point: no third-party connection until the visitor opts in.
    expect(html).not.toContain("<iframe");
    // The facade is an accessible, labelled control.
    expect(html).toMatch(/aria-label="[^"]*My clip/);
    // It reserves the video aspect box so the load doesn't shift layout.
    expect(html).toContain("aspect-ratio:16 / 9");
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
