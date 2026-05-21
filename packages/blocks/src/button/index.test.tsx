import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml } from "../test/index.js";
import { buttonBlock } from "./index.js";

describe("core/button", () => {
  test("renders a <button> when no href is provided", () => {
    const html = renderBlockSpecToHtml(buttonBlock, { label: "Save" });

    expect(html).toContain("<button");
    expect(html).toContain("Save");
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
  });

  test("renders an <a> for a safe href", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Go",
      href: "https://example.com",
    });

    expect(html).toContain('<a href="https://example.com"');
  });

  test("rejects unsafe href schemes (javascript:) and falls back to <button>", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Click",
      href: "javascript:alert(1)",
    });

    expect(html).toContain("<button");
    expect(html).not.toContain("javascript:");
  });

  test("adds rel='noopener noreferrer' when target='_blank' on a safe href", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Open",
      href: "https://example.com",
      target: "_blank",
    });

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("omits rel when target='_self' (default)", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Same",
      href: "https://example.com",
      target: "_self",
    });

    expect(html).toContain('target="_self"');
    expect(html).not.toContain("rel=");
  });

  test("falls back to primary/md when variant/size are invalid", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Click",
      variant: "wat",
      size: "xxl",
    });

    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
  });
});
