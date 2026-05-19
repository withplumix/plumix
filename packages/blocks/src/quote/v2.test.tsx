import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { quoteBlockV2 } from "./v2.js";

describe("core/quote v2", () => {
  test("renders a blockquote with the text", () => {
    const html = renderBlockSpecToHtml(quoteBlockV2, {
      text: "To be or not to be",
    });

    expect(html).toBe(
      '<div data-plumix-block="core/quote"><blockquote>To be or not to be</blockquote></div>',
    );
  });

  test("renders the cite attribute when citation is provided", () => {
    const html = renderBlockSpecToHtml(quoteBlockV2, {
      text: "I think therefore I am",
      citation: "https://example.com/descartes",
    });

    expect(html).toContain('cite="https://example.com/descartes"');
    expect(html).toContain("I think therefore I am");
  });

  test("omits cite when citation is empty", () => {
    const html = renderBlockSpecToHtml(quoteBlockV2, { text: "Quiet" });

    expect(html).not.toContain("cite=");
  });
});
