import { describe, expect, test } from "vitest";

import type { BlockNode } from "../render-block-tree.js";
import { paragraphBlock } from "../paragraph/index.js";
import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { calloutBlock } from "./index.js";

describe("core/callout", () => {
  test("renders an <aside role=note> with the info variant by default", () => {
    const html = renderBlockSpecToHtml(calloutBlock, {});

    expect(html).toContain('role="note"');
    expect(html).toContain('data-variant="info"');
  });

  test("renders the declared variant when valid", () => {
    const html = renderBlockSpecToHtml(calloutBlock, { variant: "warn" });

    expect(html).toContain('data-variant="warn"');
  });

  test("falls back to info for an unknown variant", () => {
    const html = renderBlockSpecToHtml(calloutBlock, {
      variant: "destructive",
    });

    expect(html).toContain('data-variant="info"');
  });

  test("renders the icon attribute when provided", () => {
    const html = renderBlockSpecToHtml(calloutBlock, { icon: "alert" });

    expect(html).toContain('data-icon="alert"');
  });

  test("renders nested blocks from the content slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/callout",
        attrs: {
          variant: "warn",
          content: [
            { id: "p1", name: "core/paragraph", attrs: { text: "Heads up" } },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml([calloutBlock, paragraphBlock], tree);

    expect(html).toContain("<p>Heads up</p>");
  });
});
