import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { separatorBlock } from "./index.js";

describe("core/separator", () => {
  test("renders a bare <hr> with no wrapper element", () => {
    const html = renderBlockSpecToHtml(separatorBlock, {});

    // selfSeam: the block is the <hr>, not a div wrapping it.
    expect(html).toContain("<hr");
    expect(html).not.toContain("<div");
  });

  test("seeds theme-overridable default styles onto the rule itself", () => {
    const html = renderBlockTreeToHtml(
      [separatorBlock],
      [
        {
          id: "s1",
          name: "core/separator",
          style: separatorBlock.defaultStyles,
        },
      ],
    );

    // The scoped style class lands on the <hr> (selfSeam), and the emitted CSS
    // uses `var(--plumix-separator-*, fallback)` a theme can override.
    expect(html).toContain('<hr class="plumix-block-s1"');
    expect(html).toContain("--plumix-separator-color");
    expect(html).toContain("--plumix-separator-thickness");
  });

  test("exposes no inputs — it is styled through the Styles tab", () => {
    expect(separatorBlock.inputs ?? []).toEqual([]);
  });
});
