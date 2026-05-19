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

  test("renders <dt> with the term text", () => {
    const html = renderBlockSpecToHtml(descriptionTermBlockV2, { text: "Plumix" });

    expect(html).toBe(
      '<div data-plumix-block="core/description-term"><dt>Plumix</dt></div>',
    );
  });

  test("renders <dd> with the detail text", () => {
    const html = renderBlockSpecToHtml(descriptionDetailBlockV2, { text: "A CMS" });

    expect(html).toBe(
      '<div data-plumix-block="core/description-detail"><dd>A CMS</dd></div>',
    );
  });

  test("renders a full dl with term + detail children via the items slot", () => {
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

    expect(html).toContain("<dt>Plumix</dt>");
    expect(html).toContain("<dd>A CMS</dd>");
    expect(html).toContain("<dl>");
  });
});
