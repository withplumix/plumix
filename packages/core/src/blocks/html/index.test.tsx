import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { HtmlAllowlist } from "./sanitize.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";
import { renderBlockSpecToHtml } from "../test/index.js";
import { HtmlAllowlistProvider } from "./context.js";
import { htmlBlock } from "./index.js";

describe("core/html", () => {
  test("renders the sanitized HTML inside a wrapper div", () => {
    const html = renderBlockSpecToHtml(htmlBlock, {
      html: "<p>Hello <strong>world</strong></p>",
    });

    expect(html).toContain("<p>Hello <strong>world</strong></p>");
  });

  test("strips disallowed tags via DOMPurify baseline allowlist", () => {
    const html = renderBlockSpecToHtml(htmlBlock, {
      html: "<p>Safe</p><script>alert(1)</script>",
    });

    expect(html).not.toContain("<script");
    expect(html).toContain("<p>Safe</p>");
  });

  test("renders an empty wrapper when html is explicitly empty", () => {
    const html = renderBlockSpecToHtml(htmlBlock, { html: "" });

    expect(html).toContain("<div><div></div></div>");
  });

  test("a freshly inserted block carries visible default markup", () => {
    const html = renderBlockSpecToHtml(htmlBlock, htmlBlock.defaults);

    expect(html).toContain("Custom HTML");
  });
});

// The provider is public and takes any `HtmlAllowlist`, so this is the path
// that reaches the renderer without passing through `buildHtmlAllowlist`.
describe("core/html — allowlist from the provider", () => {
  function render(html: string, allowlist: HtmlAllowlist): string {
    return renderToStaticMarkup(
      <HtmlAllowlistProvider value={allowlist}>
        {renderBlockTree(
          [{ id: "test-block", name: htmlBlock.name, attrs: { html } }],
          createBlockRegistry([htmlBlock]),
        )}
      </HtmlAllowlistProvider>,
    );
  }

  const HOSTILE: HtmlAllowlist = {
    allowedTags: ["p", "a", "script"],
    allowedAttributes: { p: ["onclick"], a: ["href"] },
    allowedSchemes: ["https", "javascript"],
  };

  // What the floors do is `floors.test.ts`'s subject; what this pins is that
  // the provider's allowlist reaches the sanitizer, floors and all.
  test("the provider's allowlist reaches the sanitizer", () => {
    const out = render(
      "<p>hi</p><em>no</em><script>alert(1)</script>",
      HOSTILE,
    );
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("<em>");
    expect(out).not.toContain("<script");
  });
});
