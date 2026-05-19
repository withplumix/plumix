import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { buttonBlockV2 } from "./v2.js";

describe("core/button v2", () => {
  test("renders a <button> when no href is provided", () => {
    const html = renderBlockSpecToHtml(buttonBlockV2, { label: "Save" });

    expect(html).toContain("<button");
    expect(html).toContain("Save");
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
  });

  test("renders an <a> for a safe href", () => {
    const html = renderBlockSpecToHtml(buttonBlockV2, {
      label: "Go",
      href: "https://example.com",
    });

    expect(html).toContain('<a href="https://example.com"');
  });

  test("rejects unsafe href schemes (javascript:) and falls back to <button>", () => {
    const html = renderBlockSpecToHtml(buttonBlockV2, {
      label: "Click",
      href: "javascript:alert(1)",
    });

    expect(html).toContain("<button");
    expect(html).not.toContain("javascript:");
  });

  test("falls back to primary/md when variant/size are invalid", () => {
    const html = renderBlockSpecToHtml(buttonBlockV2, {
      label: "Click",
      variant: "wat",
      size: "xxl",
    });

    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
  });
});
