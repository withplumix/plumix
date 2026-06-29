import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
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

    expect(html).toContain(
      '<div data-plumix-block="core/html"><div></div></div>',
    );
  });

  test("a freshly inserted block carries visible default markup", () => {
    const html = renderBlockSpecToHtml(htmlBlock, htmlBlock.defaults);

    expect(html).toContain("Custom HTML");
  });
});
