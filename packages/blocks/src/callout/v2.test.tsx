import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { paragraphBlockV2 } from "../paragraph/v2.js";
import { calloutBlockV2 } from "./v2.js";

describe("core/callout v2", () => {
  test("renders an <aside role=note> with the info variant by default", () => {
    const html = renderBlockSpecToHtml(calloutBlockV2, {});

    expect(html).toContain('role="note"');
    expect(html).toContain('data-variant="info"');
  });

  test("renders the declared variant when valid", () => {
    const html = renderBlockSpecToHtml(calloutBlockV2, { variant: "warn" });

    expect(html).toContain('data-variant="warn"');
  });

  test("falls back to info for an unknown variant", () => {
    const html = renderBlockSpecToHtml(calloutBlockV2, { variant: "destructive" });

    expect(html).toContain('data-variant="info"');
  });

  test("renders the icon attribute when provided", () => {
    const html = renderBlockSpecToHtml(calloutBlockV2, { icon: "alert" });

    expect(html).toContain('data-icon="alert"');
  });

  test("renders nested blocks from the content slot", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "c1",
        name: "core/callout",
        attrs: {
          variant: "warn",
          content: [{ id: "p1", name: "core/paragraph", attrs: { text: "Heads up" } }],
        },
      },
    ];

    const html = renderBlockTreeToHtml([calloutBlockV2, paragraphBlockV2], tree);

    expect(html).toContain("<p>Heads up</p>");
  });
});
