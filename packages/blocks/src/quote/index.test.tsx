import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { quoteBlock } from "./index.js";

describe("core/quote", () => {
  test("renders a blockquote with the text", () => {
    const html = renderBlockSpecToHtml(quoteBlock, {
      text: "To be or not to be",
    });

    expect(html).toBe(
      '<div data-plumix-block="core/quote"><blockquote>To be or not to be</blockquote></div>',
    );
  });

  test("renders the cite attribute when citation is provided", () => {
    const html = renderBlockSpecToHtml(quoteBlock, {
      text: "I think therefore I am",
      citation: "https://example.com/descartes",
    });

    expect(html).toContain('cite="https://example.com/descartes"');
    expect(html).toContain("I think therefore I am");
  });

  test("omits cite when citation is empty", () => {
    const html = renderBlockSpecToHtml(quoteBlock, { text: "Quiet" });

    expect(html).not.toContain("cite=");
  });
});
