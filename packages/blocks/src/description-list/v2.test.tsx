import type { BlockNode } from "../render-block-tree.js";
import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import {
  descriptionDetailBlockV2,
  descriptionListBlockV2,
  descriptionTermBlockV2,
} from "./v2.js";

describe("core/description-list family v2", () => {
  test("renders an empty <dl> when no items are provided", () => {
    const html = renderBlockSpecToHtml(descriptionListBlockV2, {});

    expect(html).toBe(
      '<div data-plumix-block="core/description-list"><dl></dl></div>',
    );
  });

  test("renders <dt> with the term text, no universal wrapper (inline)", () => {
    const html = renderBlockSpecToHtml(descriptionTermBlockV2, { text: "Plumix" });

    expect(html).toBe("<dt>Plumix</dt>");
  });

  test("renders <dd> with the detail text, no universal wrapper (inline)", () => {
    const html = renderBlockSpecToHtml(descriptionDetailBlockV2, { text: "A CMS" });

    expect(html).toBe("<dd>A CMS</dd>");
  });

  test("dt + dd nest as direct children of <dl> (preserves HTML content model)", () => {
    const tree: readonly BlockNode[] = [
      {
        id: "dl1",
        name: "core/description-list",
        attrs: {
          items: [
            { id: "t1", name: "core/description-term", attrs: { text: "Plumix" } },
            { id: "d1", name: "core/description-detail", attrs: { text: "A CMS" } },
          ],
        },
      },
    ];

    const html = renderBlockTreeToHtml(
      [descriptionListBlockV2, descriptionTermBlockV2, descriptionDetailBlockV2],
      tree,
    );

    expect(html).toContain("<dl><dt>Plumix</dt><dd>A CMS</dd></dl>");
  });
});
