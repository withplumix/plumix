import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { buttonBlock } from "./index.js";

describe("core/button", () => {
  test("renders a <button> when no href is provided", () => {
    const html = renderBlockSpecToHtml(buttonBlock, { label: "Save" });

    expect(html).toContain("<button");
    expect(html).toContain("Save");
  });

  test("is selfSeam — the button is the block, with no wrapper div", () => {
    const html = renderBlockTreeToHtml(
      [buttonBlock],
      [
        {
          id: "b1",
          name: "core/button",
          attrs: { label: "Click" },
          style: buttonBlock.defaultStyles,
        },
      ],
    );

    // The scoped class lands only on the <button> — not also on a wrapper div,
    // which would double-apply the styles and confuse selection tracking.
    expect(html).toContain('<button type="button" class="plumix-block-b1"');
    expect(html).not.toContain("<div");
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

  test("adds target + rel='noopener noreferrer' when openInNewTab on a safe href", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Open",
      href: "https://example.com",
      openInNewTab: true,
    });

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("omits target + rel by default (same tab)", () => {
    const html = renderBlockSpecToHtml(buttonBlock, {
      label: "Same",
      href: "https://example.com",
    });

    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("rel=");
  });

  test("seeds neutral, theme-overridable default styles", () => {
    expect(buttonBlock.defaultStyles?.large?.backgroundColor).toBe(
      "var(--plumix-button-bg, #111827)",
    );
  });
});
