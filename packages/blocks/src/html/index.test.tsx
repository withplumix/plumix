import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { htmlBlockV2 } from "./v2.js";

describe("core/html v2", () => {
  test("renders the sanitized HTML inside a wrapper div", () => {
    const html = renderBlockSpecToHtml(htmlBlockV2, {
      html: "<p>Hello <strong>world</strong></p>",
    });

    expect(html).toContain("<p>Hello <strong>world</strong></p>");
  });

  test("strips disallowed tags via DOMPurify baseline allowlist", () => {
    const html = renderBlockSpecToHtml(htmlBlockV2, {
      html: "<p>Safe</p><script>alert(1)</script>",
    });

    expect(html).not.toContain("<script");
    expect(html).toContain("<p>Safe</p>");
  });

  test("renders an empty wrapper when html is empty", () => {
    const html = renderBlockSpecToHtml(htmlBlockV2, { html: "" });

    expect(html).toContain('<div data-plumix-block="core/html"><div></div></div>');
  });
});
